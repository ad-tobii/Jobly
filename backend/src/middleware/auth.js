import supabase from '../config/supabase.js'
import { unauthorized } from './respond.js'

/**
 * Verifies the Supabase access token.
 *
 * Accepts `Authorization: Bearer <token>` normally, and falls back to a
 * `?token=` query parameter for SSE endpoints — EventSource cannot set headers.
 * The query form is only ever used on the streaming routes.
 */
const auth = async (req, res, next) => {
    const authHeader = req.headers.authorization
    const queryToken = req.query?.token

    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : queryToken

    if (!token) return next(unauthorized('No token provided'))

    try {
        const { data, error } = await supabase.auth.getUser(token)
        if (error || !data?.user) return next(unauthorized('Invalid or expired token'))

        req.user = data.user
        // Tie the request log to the user without leaking the token.
        req.log = req.log?.child({ userId: data.user.id }) ?? req.log
        next()
    } catch (err) {
        next(err)
    }
}

export default auth
