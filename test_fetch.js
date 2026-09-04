const { execSync } = require('child_process');
const fs = require('fs');

const url = 'https://api.tracker.gg/api/v2/valorant/standard/matches/cb4ebb70-4ecf-425d-8aaf-3bf9cf718631';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

try {
  const stdout = execSync(`curl.exe -s -H "User-Agent: ${ua}" "${url}"`, { encoding: 'utf8', maxBuffer: 25*1024*1024 });
  console.log('Output length:', stdout.length);
  if (stdout.trim().startsWith('{')) {
    const d = JSON.parse(stdout);
    console.log('✅ Success! Map:', d.data?.metadata?.mapName);
    fs.writeFileSync('examples/sample_match.json', JSON.stringify(d, null, 2));
    console.log('Saved to examples/sample_match.json');
  } else {
    console.log('HTML returned:', stdout.slice(0, 150));
  }
} catch (e) {
  console.error('Error:', e.message);
}
