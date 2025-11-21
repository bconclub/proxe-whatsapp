#!/bin/bash

# WhatsApp PROXe Backend Setup Script

echo "🚀 Setting up WhatsApp PROXe Backend..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Current: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Check for .env file
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file. Please update it with your credentials."
    else
        echo "❌ .env.example not found. Please create .env manually."
    fi
else
    echo "✅ .env file exists"
fi

# Check for required environment variables
echo "🔍 Checking environment variables..."
source .env 2>/dev/null || true

REQUIRED_VARS=("SUPABASE_URL" "SUPABASE_KEY" "CLAUDE_API_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "⚠️  Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo "Please update your .env file."
else
    echo "✅ All required environment variables are set"
fi

# Database setup reminder
echo ""
echo "📊 Database Setup:"
echo "   1. Go to your Supabase project SQL Editor"
echo "   2. Run src/database/schema.sql to create tables"
echo "   3. Verify tables are created: customers, conversation_history, conversation_logs, knowledge_base"

# PM2 setup reminder
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "⚠️  PM2 is not installed. Install with: npm install -g pm2"
else
    echo "✅ PM2 is installed"
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "   1. Update .env with your credentials"
echo "   2. Run database schema in Supabase"
echo "   3. Start server: npm run dev (development) or pm2 start ecosystem.config.js (production)"
echo "   4. Test: curl http://localhost:3000/health"

