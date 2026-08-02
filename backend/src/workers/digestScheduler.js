import supabase from '../config/supabase.js';
import { digestQueue } from '../queues/index.js';
import { registerGmailWatch } from '../config/google.js';
import { isDigestDue } from '../utils/digestSchedule.js';

async function scheduleDigests() {
  try {
    console.log('[digestScheduler] Running digest check...');
    
    // 1. Fetch all users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, preferences, last_digest_sent');

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }

    if (!users || users.length === 0) return;

    let queuedCount = 0;

    // 2. For each user determine if due — see utils/digestSchedule.js
    for (const user of users) {
      if (isDigestDue(user)) {
        // 3. Queue the digest
        await digestQueue.add('send-digest', { user_id: user.id });
        queuedCount++;
      }
    }

    // 4. Log
    console.log(`[digestScheduler] Queued digests for ${queuedCount} users.`);
  } catch (err) {
    console.error('[digestScheduler] Error running schedule:', err.message);
  }
}

// Run every 30 minutes
setInterval(scheduleDigests, 30 * 60 * 1000);

// Run once immediately on startup just in case
setTimeout(scheduleDigests, 5000);

async function renewGmailWatches() {
  try {
    console.log('[digestScheduler] Renewing Gmail watches...');
    
    const { data: users, error } = await supabase
      .from('users')
      .select('email, gmail_refresh_token')
      .not('gmail_refresh_token', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch users with Gmail connected: ${error.message}`);
    }

    if (!users || users.length === 0) return;

    let renewedCount = 0;

    for (const user of users) {
      try {
        await registerGmailWatch(user.gmail_refresh_token, user.email);
        renewedCount++;
      } catch (err) {
        console.error(`[digestScheduler] Failed to renew watch for ${user.email}:`, err.message);
      }
    }

    console.log(`[digestScheduler] Renewed Gmail watches for ${renewedCount} users.`);
  } catch (err) {
    console.error('[digestScheduler] Error running watch renewal:', err.message);
  }
}

// Run watch renewal every 6 hours
setInterval(renewGmailWatches, 6 * 60 * 60 * 1000);

// Run watch renewal once immediately on startup
setTimeout(renewGmailWatches, 5000);

export default scheduleDigests;
