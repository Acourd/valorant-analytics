#!/usr/bin/env node
'use strict';

/**
 * merkle_ledger.js - Cryptographic Merkle Ledger & Event Audit Tree
 * 
 * Provides tamper-evident verification for Valorant match telemetry.
 * Each round event (kill, death, plant, defuse, duel) forms a leaf in a Merkle tree.
 * The Merkle root establishes cryptographic immutability of match telemetry.
 * 
 * Zero external dependencies. Pure Node.js crypto.
 */

const crypto = require('crypto');

function sha256(data) {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

class MerkleTree {
  constructor(leaves = []) {
    this.leaves = leaves.map(leaf => (typeof leaf === 'string' && leaf.length === 64 && /^[0-9a-f]+$/i.test(leaf)) ? leaf : sha256(leaf));
    this.layers = [];
    this.buildTree();
  }

  buildTree() {
    if (this.leaves.length === 0) {
      this.layers = [[sha256('EMPTY_TREE')]];
      return;
    }

    let current = [...this.leaves];
    this.layers = [current];

    while (current.length > 1) {
      const next = [];
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          next.push(sha256(current[i] + current[i + 1]));
        } else {
          // Odd leaf is duplicated to maintain binary tree structure
          next.push(sha256(current[i] + current[i]));
        }
      }
      this.layers.push(next);
      current = next;
    }
  }

  getRoot() {
    return this.layers[this.layers.length - 1][0];
  }

  getProof(leafIndex) {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} fuera de rango (0-${this.leaves.length - 1})`);
    }

    const proof = [];
    let idx = leafIndex;

    for (let l = 0; l < this.layers.length - 1; l++) {
      const layer = this.layers[l];
      const isRightNode = idx % 2 === 1;
      const pairIdx = isRightNode ? idx - 1 : (idx + 1 < layer.length ? idx + 1 : idx);

      proof.push({
        position: isRightNode ? 'left' : 'right',
        hash: layer[pairIdx]
      });

      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  static verifyProof(leafHash, proof, root) {
    let currentHash = leafHash;

    for (const item of proof) {
      if (item.position === 'left') {
        currentHash = sha256(item.hash + currentHash);
      } else {
        currentHash = sha256(currentHash + item.hash);
      }
    }

    return currentHash === root;
  }
}

/**
 * Extracts and hashes discrete match events (rounds, kills, duels) into a Merkle Ledger
 */
function buildMatchMerkleLedger(matchData) {
  const events = [];

  if (matchData.data && Array.isArray(matchData.data.segments)) {
    const roundSummaries = matchData.data.segments.filter(s => s.type === 'round-summary');
    const damages = matchData.data.segments.filter(s => s.type === 'player-round-damage');

    roundSummaries.forEach(rs => {
      events.push({
        type: 'round_summary',
        roundIndex: rs.attributes?.round,
        winningTeam: rs.stats?.winningTeam?.displayValue || 'Unknown',
        plant: Boolean(rs.metadata?.plant),
        defuse: Boolean(rs.metadata?.defuse)
      });
    });

    damages.forEach(d => {
      events.push({
        type: 'damage_event',
        round: d.attributes?.round,
        attacker: d.attributes?.platformUserIdentifier,
        victim: d.attributes?.opponentPlatformUserIdentifier,
        damage: d.stats?.damage?.value || 0,
        headshots: d.stats?.headshots?.value || 0
      });
    });
  } else if (matchData.rounds && Array.isArray(matchData.rounds)) {
    matchData.rounds.forEach((round, rIdx) => {
      events.push({
        type: 'round_summary',
        roundIndex: rIdx + 1,
        winningTeam: round.winningTeam || round.winner,
        bombPlanted: Boolean(round.bombPlanted),
        bombDefused: Boolean(round.bombDefused)
      });

      if (round.playerStats && Array.isArray(round.playerStats)) {
        round.playerStats.forEach(ps => {
          if (ps.kills && Array.isArray(ps.kills)) {
            ps.kills.forEach(k => {
              events.push({
                type: 'kill_event',
                round: rIdx + 1,
                killer: ps.player || ps.puuid,
                victim: k.victim || k.victimPuuid,
                weapon: k.damageItem || k.weapon,
                headshot: Boolean(k.headshot)
              });
            });
          }
        });
      }
    });
  } else {
    // Fallback para resúmenes de partida sin desglose por ronda
    events.push({
      type: 'match_header',
      id: matchData.id || matchData.matchId || 'match_unknown',
      map: matchData.map || 'Unknown',
      timestamp: matchData.timestamp || new Date().toISOString()
    });
  }

  const leaves = events.map(e => sha256(e));
  const tree = new MerkleTree(leaves);

  return {
    root: tree.getRoot(),
    totalEvents: events.length,
    events,
    tree
  };
}

module.exports = {
  sha256,
  MerkleTree,
  buildMatchMerkleLedger
};

if (require.main === module) {
  const dummyEvents = [
    { round: 1, type: 'first_blood', killer: 'TenZ#0001', victim: 'Chronicle#0001' },
    { round: 1, type: 'spike_plant', site: 'A' },
    { round: 2, type: 'clutch_1v2', player: 'TenZ#0001' }
  ];
  const tree = new MerkleTree(dummyEvents);
  const root = tree.getRoot();
  const proof = tree.getProof(0);
  const leaf0 = sha256(dummyEvents[0]);
  const verified = MerkleTree.verifyProof(leaf0, proof, root);
  console.log(`Merkle Root: ${root}`);
  console.log(`Proof Verification: ${verified ? 'PASS (Exit 0)' : 'FAIL'}`);
}
