import express from 'express'
import supabase from '../config/supabase.js'
import auth from '../middleware/auth.js'
import oauth2Client, { registerGmailWatch } from '../config/google.js'

const router = express.Router()

// signup
router.post('/signup', async (req, res) => {
    const { email, password, full_name } = req.body

    if (!email || !password || !full_name) {
        return res.status(400).json({
            success: false,
            error: 'Email, password and full name are required'
        })
    }

    // create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
    })

    if (authError) {
        return res.status(400).json({
            success: false,
            error: authError.message
        })
    }

    // create user profile
    const { error: profileError } = await supabase
        .from('users')
        .insert({
            id: authData.user.id,
            email,
            full_name,
            onboarding_complete: false
        })

    if (profileError) {
        return res.status(500).json({
            success: false,
            error: profileError.message
        })
    }

    return res.status(201).json({
        success: true,
        data: {
            user: authData.user,
            session: authData.session
        }
    })
})


// login
router.post('/login', async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required'
        })
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    })

    if (error) {
        return res.status(401).json({
            success: false,
            error: error.message
        })
    }

    return res.json({
        success: true,
        data: {
            user: data.user,
            session: data.session
        }
    })
})


// logout
router.post('/logout', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'No token provided'
        })
    }

    const { error } = await supabase.auth.signOut()

    if (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        })
    }

    return res.json({
        success: true,
        message: 'Logged out successfully'
    })
})


// get current user
router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'No token provided'
        })
    }

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        })
    }

    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, linkedin_url, city, country, preferences, gmail_refresh_token, onboarding_complete')
        .eq('id', user.id)
        .single()

    if (profileError) {
        return res.status(500).json({
            success: false,
            error: profileError.message
        })
    }

    const userProfile = {
      ...profile,
      gmail_connected: !!profile.gmail_refresh_token
    };
    
    // We can omit the refresh token from the response for security
    delete userProfile.gmail_refresh_token;

    return res.json({
        success: true,
        data: userProfile
    })
})

// PATCH /auth/profile
router.patch('/profile', auth, async (req, res) => {
    const { full_name, phone, linkedin_url, city, country } = req.body;
    
    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) updates.phone = phone;
    if (linkedin_url !== undefined) updates.linkedin_url = linkedin_url;
    if (city !== undefined) updates.city = city;
    if (country !== undefined) updates.country = country;

    const { data: profile, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', req.user.id)
        .select('id, full_name, email, phone, linkedin_url, city, country, preferences, gmail_refresh_token, onboarding_complete')
        .single();

    if (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }

    const userProfile = {
      ...profile,
      gmail_connected: !!profile.gmail_refresh_token
    };
    delete userProfile.gmail_refresh_token;

    return res.json({
        success: true,
        data: userProfile
    });
})

// POST /auth/onboarding/complete
router.post('/onboarding/complete', auth, async (req, res) => {
  const { preferences = {} } = req.body;
  const allowedFrequencies = ['daily', 'twice_daily', 'weekly'];
  const digestFrequency = preferences.digest_frequency || 'daily';
  const digestTime = preferences.digest_time || '08:00';
  const timezone = preferences.timezone || 'UTC';

  if (!allowedFrequencies.includes(digestFrequency)) {
    return res.status(400).json({
      success: false,
      error: 'Digest frequency must be daily, twice_daily, or weekly'
    });
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(digestTime)) {
    return res.status(400).json({
      success: false,
      error: 'Digest time must be in HH:mm format'
    });
  }

  const nextPreferences = {
    digest_frequency: digestFrequency,
    digest_time: digestTime,
    timezone
  };

  const { data: profile, error } = await supabase
    .from('users')
    .update({
      preferences: nextPreferences,
      onboarding_complete: true
    })
    .eq('id', req.user.id)
    .select('id, full_name, email, phone, linkedin_url, city, country, preferences, gmail_refresh_token, onboarding_complete')
    .single();

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  const userProfile = {
    ...profile,
    gmail_connected: !!profile.gmail_refresh_token
  };
  delete userProfile.gmail_refresh_token;

  return res.json({
    success: true,
    data: userProfile
  });
})

// GET /auth/gmail
router.get('/gmail', auth, (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.metadata',
    ],
    state: req.user.id,
  });
  res.redirect(url);
});

// GET /auth/gmail/callback
router.get('/gmail/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'No authorization code received' });
    }

    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      return res.status(400).json({ error: 'No refresh token received. User may need to re-authorize.' });
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ gmail_refresh_token: tokens.refresh_token })
      .eq('id', state);

    if (updateError) throw updateError;

    await registerGmailWatch(tokens.refresh_token, 'User');
    
    res.redirect(`${process.env.FRONTEND_URL}/onboarding?gmail=connected`);
  } catch (error) {
    console.error('Gmail OAuth Callback Error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/onboarding?gmail=error`);
  }
});

// POST /auth/gmail/watch
router.post('/gmail/watch', auth, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('gmail_refresh_token, email')
      .eq('id', req.user.id)
      .single();

    if (userError || !user) throw new Error('Failed to fetch user');

    if (!user.gmail_refresh_token) {
      return res.status(400).json({ error: 'Gmail not connected. Complete OAuth first via GET /auth/gmail' });
    }

    await registerGmailWatch(user.gmail_refresh_token, user.email);

    res.status(200).json({ message: 'Gmail watch registered' });
  } catch (error) {
    console.error('Gmail Watch Re-register Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router
