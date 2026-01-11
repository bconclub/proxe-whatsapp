/**
 * Script to populate knowledge base with PROXe AI Operating System content
 * Run with: node scripts/populate-knowledge-base.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_PROXE_SUPABASE_URL and NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Knowledge base entries for PROXe AI Operating System
 */
const knowledgeBaseEntries = [
  {
    content: `PROXe is an AI Operating System for businesses. It connects AI to every customer touchpoint including Website, WhatsApp, Voice calls, and Social Media, so all channels share one unified memory. PROXe automatically retrains itself in real-time and switches to the newest fine-tuned model as soon as it's available, ensuring customers always interact with the most advanced AI.`,
    category: 'product_overview'
  },
  {
    content: `PROXe features include: Multi-channel integration (Website chat, WhatsApp, Voice, Social Media), Unified customer memory across all touchpoints, Automatic model retraining and upgrades, Real-time learning from customer interactions, 24/7 availability, Lead qualification and routing, Conversation history tracking, and Seamless handoff to human agents when needed.`,
    category: 'features'
  },
  {
    content: `PROXe is NOT a real estate company, property, or commercial project. PROXe is a software platform - an AI Operating System that businesses use to automate customer interactions across multiple channels.`,
    category: 'clarification'
  },
  {
    content: `PROXe helps businesses by: Eliminating the need to answer customer queries at 2 AM, Automatically qualifying leads before they reach your team, Providing consistent customer experience across all channels, Learning from every interaction to improve responses, Reducing response time from hours to seconds, and Freeing up your team to focus on closing deals instead of answering repetitive questions.`,
    category: 'benefits'
  },
  {
    content: `PROXe can be integrated into your business website, WhatsApp Business account, phone system, and social media platforms. The AI operates across all these channels simultaneously, maintaining context and conversation history. Setup typically takes 30 seconds to a few minutes depending on the channel.`,
    category: 'integration'
  },
  {
    content: `PROXe uses advanced AI models that are continuously fine-tuned based on your business's actual customer interactions. The system automatically upgrades to newer models as they become available, ensuring your customers always interact with the most capable AI. This self-improving capability is what makes PROXe an "Operating System" rather than just a chatbot.`,
    category: 'technology'
  },
  {
    content: `PROXe is designed for fast-growing businesses that need to scale customer support without proportionally scaling their support team. It's ideal for businesses receiving leads through multiple channels (website, WhatsApp, calls, social media) and want to ensure no lead goes unanswered, even outside business hours.`,
    category: 'target_audience'
  },
  {
    content: `When someone asks "What is PROXe?", respond: "PROXe is the AI Operating System for Businesses. One brain runs your site chat, WhatsApp, calls & social media, upgrades itself automatically, and never forgets a customer. You stop answering at 2 AM. Leads arrive qualified. Your team just closes." Keep responses concise unless they ask for more details.`,
    category: 'faq'
  }
];

/**
 * Populate knowledge base
 */
async function populateKnowledgeBase() {
  console.log('🚀 Starting knowledge base population...\n');

  try {
    // Check if entries already exist
    const { data: existing, error: checkError } = await supabase
      .from('knowledge_base')
      .select('id, content')
      .limit(1);

    if (checkError) {
      console.error('❌ Error checking knowledge base:', checkError);
      throw checkError;
    }

    if (existing && existing.length > 0) {
      console.log('⚠️  Knowledge base already has entries.');
      console.log('   To replace them, delete existing entries first in Supabase Dashboard.\n');
    }

    // Insert entries
    const { data, error } = await supabase
      .from('knowledge_base')
      .insert(knowledgeBaseEntries)
      .select();

    if (error) {
      console.error('❌ Error inserting knowledge base entries:', error);
      throw error;
    }

    console.log(`✅ Successfully added ${data.length} entries to knowledge base!\n`);
    console.log('📋 Categories added:');
    const categories = [...new Set(data.map(item => item.category))];
    categories.forEach(cat => {
      const count = data.filter(item => item.category === cat).length;
      console.log(`   - ${cat}: ${count} entry/entries`);
    });

    console.log('\n✨ Knowledge base is now populated with PROXe AI Operating System content!');
    console.log('   The AI will now correctly identify PROXe as an AI system, not real estate.\n');

  } catch (error) {
    console.error('❌ Failed to populate knowledge base:', error);
    console.error('\nTroubleshooting:');
    console.error('1. Check your Supabase credentials in .env.local');
    console.error('2. Ensure the knowledge_base table exists in your database');
    console.error('3. Verify RLS policies allow inserts');
    process.exit(1);
  }
}

// Run the script
populateKnowledgeBase();

