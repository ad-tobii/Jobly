import express from 'express';
import { digestQueue, scrapeQueue } from '../queues/index.js';
import oauth2Client from '../config/google.js';
import { google } from 'googleapis';
import supabase from '../config/supabase.js';

const router = express.Router();

router.post('/notify', async (req, res) => {
    try {
        const secret = req.headers['x-webhook-secret'];
        if (secret !== process.env.WEBHOOK_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { user_id } = req.body;
        if (!user_id) {
            return res.status(400).json({ error: 'user_id is required' });
        }

        await digestQueue.add('send-digest', { user_id });
        res.status(200).json({ message: 'Digest queued' });
    } catch (err) {
        console.error('Webhook notify error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/gmail', async (req, res) => {
    // 1. No auth middleware — this is called by Google
    // 2. Verify the request is from Google
    if (!req.body || !req.body.message) {
        return res.status(204).send();
    }

    try {
        // 3. Decode the Pub/Sub message
        const data = JSON.parse(
            Buffer.from(req.body.message.data, 'base64').toString()
        );
        
        if (!data.emailAddress || !data.historyId) {
            return res.status(204).send();
        }

        // 4. Fetch the user
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, gmail_refresh_token')
            .eq('email', data.emailAddress)
            .single();

        if (userError || !user || !user.gmail_refresh_token) {
            return res.status(204).send();
        }

        // 5. Use the Gmail API to fetch the actual email
        oauth2Client.setCredentials({ refresh_token: user.gmail_refresh_token });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const historyResponse = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: data.historyId,
            historyTypes: ['messageAdded'],
        });

        if (!historyResponse.data.history) {
            return res.status(204).send();
        }

        const newMessages = historyResponse.data.history.flatMap(h => h.messagesAdded || []);

        for (const added of newMessages) {
            if (!added.message || !added.message.id) continue;

            const msgResponse = await gmail.users.messages.get({
                userId: 'me',
                id: added.message.id,
                format: 'full',
            });

            const payload = msgResponse.data.payload;
            const headers = payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            
            let body = '';
            if (payload.parts) {
                const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
                if (textPart && textPart.body && textPart.body.data) {
                    body = Buffer.from(textPart.body.data, 'base64').toString();
                }
            } else if (payload.body && payload.body.data) {
                body = Buffer.from(payload.body.data, 'base64').toString();
            }

            // 7. Extract LinkedIn job URLs
            const linkedinJobRegex = /https:\/\/www\.linkedin\.com\/jobs\/view\/[\w-]+/g;
            const rawUrls = [
                ...(body.match(linkedinJobRegex) || []),
                ...(subject.match(linkedinJobRegex) || [])
            ];
            const urls = [...new Set(rawUrls)];

            // 8. For each unique URL found
            for (const url of urls) {
                // Check if job already exists
                const { data: existingJob } = await supabase
                    .from('jobs')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('source_url', url)
                    .maybeSingle();

                if (!existingJob) {
                    const { data: newJob, error: insertError } = await supabase
                        .from('jobs')
                        .insert({
                            user_id: user.id,
                            source_url: url,
                            source_type: 'url',
                            status: 'scraping'
                        })
                        .select()
                        .single();

                    if (!insertError && newJob) {
                        await scrapeQueue.add('scrape-job', { 
                            job_id: newJob.id, 
                            user_id: user.id, 
                            url 
                        });
                        console.log(`[gmail webhook] Queued scrape for URL from user email`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Gmail Webhook Error:', error);
    }
    
    // 9. Return 204
    return res.status(204).send();
});

export default router;