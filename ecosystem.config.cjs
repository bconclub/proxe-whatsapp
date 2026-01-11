/**
 * PM2 Ecosystem Configuration
 * Run with: pm2 start ecosystem.config.cjs
 */

module.exports = {
  apps: [{
    name: 'whatsapp-proxe',
    script: './src/server.js',
    instances: 2, // Cluster mode - 2 instances
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Auto-restart settings
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Advanced settings
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000
  }]
};

