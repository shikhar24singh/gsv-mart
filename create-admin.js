const readline = require('node:readline/promises');
const { openDatabase, hashPassword } = require('./database');

async function main() {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  let email, password;
  try {
    email = (await prompt.question('Admin email: ')).trim().toLowerCase();
    // Hide password input on interactive terminals, including Windows PowerShell.
    if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal.');
    prompt.close();
    process.stdout.write('Password (at least 12 characters): ');
    password = await new Promise((resolve, reject) => {
      let value = '';
      process.stdin.setRawMode(true); process.stdin.resume();
      const onData = chunk => {
        for (const char of chunk.toString()) {
          if (char === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
          if (char === '\r' || char === '\n') { cleanup(); resolve(value); return; }
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else if (char >= ' ') value += char;
        }
      };
      function cleanup() { process.stdin.setRawMode(false); process.stdin.removeListener('data', onData); process.stdin.pause(); process.stdout.write('\n'); }
      process.stdin.on('data', onData);
    });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (password.length < 12 || password.length > 256) throw new Error('Password must contain 12–256 characters.');
    const db = openDatabase();
    try { db.prepare('INSERT INTO admins(email,password) VALUES (?,?)').run(email, hashPassword(password)); }
    finally { db.close(); }
    console.log('Admin account created. Start the website and use Admin to sign in.');
  } finally { prompt.close(); }
}
main().catch(error => { console.error(error.message.includes('UNIQUE') ? 'An admin already exists with that email.' : error.message); process.exitCode = 1; });
