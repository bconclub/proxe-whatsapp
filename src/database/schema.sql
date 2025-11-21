-- WhatsApp PROXe Backend Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector"; -- For pgvector (knowledge base)

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  company TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_contacted TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'lead' CHECK (status IN ('lead', 'customer', 'closed')),
  tags JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index on phone for fast lookups
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_last_contacted ON customers(last_contacted DESC);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- Conversation history table
CREATE TABLE IF NOT EXISTS conversation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'button_click', 'carousel_view', 'template'))
);

-- Create indexes for conversation history
CREATE INDEX IF NOT EXISTS idx_conversation_history_customer_id ON conversation_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversation_history_timestamp ON conversation_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_history_customer_timestamp ON conversation_history(customer_id, timestamp DESC);

-- Conversation logs table (for analytics and retraining)
CREATE TABLE IF NOT EXISTS conversation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  response_type TEXT DEFAULT 'text_only',
  tokens_used INTEGER DEFAULT 0,
  response_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for conversation logs
CREATE INDEX IF NOT EXISTS idx_conversation_logs_customer_id ON conversation_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_created_at ON conversation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_customer_created ON conversation_logs(customer_id, created_at DESC);

-- Knowledge base table (with vector embeddings for semantic search)
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 dimension, adjust for your embedding model
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);

-- Full-text search index for fallback
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_search ON knowledge_base 
  USING gin(to_tsvector('english', content));

-- Row Level Security (RLS) policies
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to access all data
CREATE POLICY "Service role full access" ON customers
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON conversation_history
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON conversation_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON knowledge_base
  FOR ALL USING (auth.role() = 'service_role');

-- Policy: Allow anon key to read/write (for API access)
CREATE POLICY "Anon key access" ON customers
  FOR ALL USING (true);

CREATE POLICY "Anon key access" ON conversation_history
  FOR ALL USING (true);

CREATE POLICY "Anon key access" ON conversation_logs
  FOR ALL USING (true);

CREATE POLICY "Anon key access" ON knowledge_base
  FOR SELECT USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for knowledge_base updated_at
CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function for vector similarity search (example - adjust embedding model as needed)
CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    knowledge_base.id,
    knowledge_base.content,
    knowledge_base.category,
    1 - (knowledge_base.embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE 1 - (knowledge_base.embedding <=> query_embedding) > match_threshold
  ORDER BY knowledge_base.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

