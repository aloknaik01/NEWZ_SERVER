import pg from 'pg';
import conf from './conf.js';

const { Pool } = pg;

const pool = new Pool({
    host: conf.db.db_host,
    port: conf.db.db_port,
    user: conf.db.db_user,
    password: conf.db.db_password,
    database: conf.db.db_name,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
    console.log('PostgreSQL connected successfully');
});

pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
    process.exit(-1);
});

export default pool;