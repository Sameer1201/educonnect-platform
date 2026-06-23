const { Client } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_4GlEtF9DYPgQ@ep-broad-glitter-aoszaaw2.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const client = new Client({ connectionString });

(async () => {
  try {
    await client.connect();
    const newHash = '3b1a15ed82b691b763c5362565ba92dbeb92048a06c2c59f3983911fc3908ef7';
    const result = await client.query(
      'UPDATE users SET password_hash = $1 WHERE username = $2 RETURNING username, email',
      [newHash, 'Sameer_Student']
    );
    console.log('✓ Password updated successfully!');
    if (result.rows[0]) {
      console.log('Username:', result.rows[0].username);
      console.log('Email:', result.rows[0].email);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
})();
