import express from 'express'
import supabase from '../config/supabase.js'
import auth from '../middleware/auth.js'
import oauth2Client, { registerGmailWatch } from '../config/google.js'
import { asyncHandler, badRequest, unauthorized, ApiError } from '../middleware/respond.js'
import validate from '../middleware/validate.js'
import { loginSchema, onboardingSchema, profileSchema, signupSchema } from '../schemas/index.js'

const router = express.Router()

const PROFILE_COLUMNS =
    'id, full_name, email, phone, linkedin_url, city, country, preferences, gmail_refresh_token, onboarding_complete'

/**
 * Map a Supabase auth failure onto our own error type.
 *
 * Only genuine 4xx responses carry a message worth showing the user — a
 * transport failure ("fetch failed") is our problem, not theirs, and must not
 * be surfaced as a validation message.
 */
function fromSupabaseAuthError(authError) {
    const status = authError?.status
    if (typeof status === 'number' && status >= 400 && status < 500) {
        return new ApiError(status, authError.message)
    }
    return new ApiError(500, 'Could not reach the authentication service.')
}

/** Strip the stored refresh token, exposing only whether Gmail is linked. */
function presentProfile(profile) {
    const { gmail_refresh_token, ...rest } = profile
    return { ...rest, gmail_connected: Boolean(gmail_refresh_token) }
}

// ── POST /auth/signup ────────────────────────────────────────────────────────
router.post(
    '/signup',
    validate({ body: signupSchema }),
    asyncHandler(async (req, res) => {
        const { email, password, full_name } = req.body

        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
        if (authError) throw fromSupabaseAuthError(authError)

        const { error: profileError } = await supabase
            .from('users')
            .insert({ id: authData.user.id, email, full_name, onboarding_complete: false })

        if (profileError) throw new ApiError(500, profileError.message)

        req.log?.info({ userId: authData.user.id }, 'user signed up')
        res.ok({ user: authData.user, session: authData.session }, 201)
    }),
)

// ── POST /auth/login ─────────────────────────────────────────────────────────
router.post(
    '/login',
    validate({ body: loginSchema }),
    asyncHandler(async (req, res) => {
        const { email, password } = req.body

        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
            // Deliberately generic for credential failures: don't reveal whether
            // the address exists. Anything else is a real outage.
            const status = error?.status
            if (typeof status === 'number' && status >= 400 && status < 500) {
                throw unauthorized('Incorrect email or password.')
            }
            throw new ApiError(500, 'Could not reach the authentication service.')
        }

        res.ok({ user: data.user, session: data.session })
    }),
)

// ── POST /auth/logout ────────────────────────────────────────────────────────
router.post(
    '/logout',
    asyncHandler(async (req, res) => {
        await supabase.auth.signOut()
        res.ok({ message: 'Logged out successfully' })
    }),
)

// ── GET /auth/me ─────────────────────────────────────────────────────────────
router.get(
    '/me',
    auth,
    asyncHandler(async (req, res) => {
        const { data: profile, error } = await supabase
            .from('users')
            .select(PROFILE_COLUMNS)
            .eq('id', req.user.id)
            .maybeSingle()

        if (error) throw new ApiError(500, error.message)
        if (!profile) throw unauthorized('Profile not found')

        res.ok(presentProfile(profile))
    }),
)

// ── PATCH /auth/profile ──────────────────────────────────────────────────────
router.patch(
    '/profile',
    auth,
    validate({ body: profileSchema }),
    asyncHandler(async (req, res) => {
        const { data: profile, error } = await supabase
            .from('users')
            .update(req.body)
            .eq('id', req.user.id)
            .select(PROFILE_COLUMNS)
            .maybeSingle()

        if (error) throw new ApiError(500, error.message)
        if (!profile) throw new ApiError(500, 'Profile not found')

        res.ok(presentProfile(profile))
    }),
)

// ── POST /auth/onboarding/complete ───────────────────────────────────────────
router.post(
    '/onboarding/complete',
    auth,
    validate({ body: onboardingSchema }),
    asyncHandler(async (req, res) => {
        const { data: existing } = await supabase
            .from('users')
            .select('preferences')
            .eq('id', req.user.id)
            .maybeSingle()

        const nextPreferences = { ...(existing?.preferences || {}), ...req.body.preferences }

        const { data: profile, error } = await supabase
            .from('users')
            .update({ preferences: nextPreferences, onboarding_complete: true })
            .eq('id', req.user.id)
            .select(PROFILE_COLUMNS)
            .maybeSingle()

        if (error) throw new ApiError(500, error.message)
        if (!profile) throw new ApiError(500, 'Profile not found')

        req.log?.info({ userId: req.user.id }, 'onboarding complete')
        res.ok(presentProfile(profile))
    }),
)

// ── GET /auth/gmail — start OAuth ────────────────────────────────────────────
router.get('/gmail', auth, (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.metadata',
        ],
        state: req.user.id,
    })
    res.redirect(url)
})

// ── GET /auth/gmail/callback ─────────────────────────────────────────────────
// Redirects rather than returning JSON — the browser lands here from Google.
router.get('/gmail/callback', async (req, res) => {
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173'

    try {
        const { code, state } = req.query
        if (!code || !state) return res.redirect(`${frontend}/onboarding?gmail=error`)

        const { tokens } = await oauth2Client.getToken(code)
        if (!tokens.refresh_token) return res.redirect(`${frontend}/onboarding?gmail=error`)

        const { data: user, error: updateError } = await supabase
            .from('users')
            .update({ gmail_refresh_token: tokens.refresh_token })
            .eq('id', state)
            .select('email')
            .maybeSingle()

        if (updateError || !user) throw updateError || new Error('User not found')

        await registerGmailWatch(tokens.refresh_token, user.email)
        res.redirect(`${frontend}/onboarding?gmail=connected`)
    } catch (error) {
        req.log?.error({ err: error?.message }, 'gmail oauth callback failed')
        res.redirect(`${frontend}/onboarding?gmail=error`)
    }
})

// ── POST /auth/gmail/watch — re-register the inbox watch ─────────────────────
router.post(
    '/gmail/watch',
    auth,
    asyncHandler(async (req, res) => {
        const { data: user, error } = await supabase
            .from('users')
            .select('gmail_refresh_token, email')
            .eq('id', req.user.id)
            .maybeSingle()

        if (error) throw new ApiError(500, error.message)
        if (!user?.gmail_refresh_token) {
            throw badRequest('Gmail is not connected yet.')
        }

        await registerGmailWatch(user.gmail_refresh_token, user.email)
        res.ok({ message: 'Gmail watch registered' })
    }),
)

export default router
