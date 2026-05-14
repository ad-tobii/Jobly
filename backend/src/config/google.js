import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function registerGmailWatch(refreshToken, userEmail) {
  // Set credentials on oauth client
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  // Create Gmail API client
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Register watch on inbox
  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      labelIds: ['INBOX'],
      topicName: 'projects/jobly-495600/topics/jobly-gmail-watch',
    },
  });

  // response.data contains: { historyId, expiration }
  // Log the expiration so we know when to renew
  console.log(`[gmail] Watch registered for ${userEmail || 'User'} — expires ${new Date(parseInt(response.data.expiration))}`);

  return response.data;
}

export default oauth2Client;
