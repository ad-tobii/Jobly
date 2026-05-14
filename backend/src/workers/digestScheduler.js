import { DateTime } from 'luxon';
import supabase from '../config/supabase.js';
import { digestQueue } from '../queues/index.js';
import { registerGmailWatch } from '../config/google.js';

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

    // 2. For each user determine if due
    for (const user of users) {
      const prefs = user.preferences || {};
      const frequency = prefs.digest_frequency || 'daily';
      const digestTime = prefs.digest_time || '08:00';
      const timezone = prefs.timezone || 'UTC';
      const lastSent = user.last_digest_sent;

      const nowUserTZ = DateTime.now().setZone(timezone);
      
      // Parse preferred digest time
      const [hour, minute] = digestTime.split(':').map(Number);
      
      let isDue = false;

      if (frequency === 'daily') {
        const preferredTimeToday = nowUserTZ.set({ hour, minute, second: 0, millisecond: 0 });
        const timeDiffMins = nowUserTZ.diff(preferredTimeToday, 'minutes').minutes;
        
        // Window: up to 30 mins after preferred time
        if (timeDiffMins >= 0 && timeDiffMins <= 30) {
            // Check if we haven't already sent one in the last 24h (give some buffer, e.g., 23h)
            if (!lastSent || DateTime.now().diff(DateTime.fromISO(lastSent), 'hours').hours >= 23) {
              isDue = true;
            }
        }
      } else if (frequency === 'twice_daily') {
        const preferredTime1 = nowUserTZ.set({ hour, minute, second: 0, millisecond: 0 });
        const preferredTime2 = preferredTime1.plus({ hours: 12 });
        
        const timeDiff1Mins = nowUserTZ.diff(preferredTime1, 'minutes').minutes;
        const timeDiff2Mins = nowUserTZ.diff(preferredTime2, 'minutes').minutes;
        
        if ((timeDiff1Mins >= 0 && timeDiff1Mins <= 30) || (timeDiff2Mins >= 0 && timeDiff2Mins <= 30)) {
            // Check if we haven't already sent one in the last 12h (give some buffer, e.g., 11h)
            if (!lastSent || DateTime.now().diff(DateTime.fromISO(lastSent), 'hours').hours >= 11) {
              isDue = true;
            }
        }
      } else if (frequency === 'weekly') {
        // Find if it's the right day of the week. Default to Monday (1) if no previous lastSent.
        let targetWeekday = 1;
        if (lastSent) {
           targetWeekday = DateTime.fromISO(lastSent).setZone(timezone).weekday;
        }

        if (nowUserTZ.weekday === targetWeekday) {
            const preferredTimeToday = nowUserTZ.set({ hour, minute, second: 0, millisecond: 0 });
            const timeDiffMins = nowUserTZ.diff(preferredTimeToday, 'minutes').minutes;
            
            if (timeDiffMins >= 0 && timeDiffMins <= 30) {
                // Check if we haven't sent one in the last 7 days (e.g. 6.5 days buffer)
                if (!lastSent || DateTime.now().diff(DateTime.fromISO(lastSent), 'days').days >= 6.5) {
                    isDue = true;
                }
            }
        }
      }

      if (isDue) {
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
