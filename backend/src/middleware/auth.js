import supabase from '../config/supabase.js'

const auth = async (req, res, next) => {
    const authHeader = req.headers.authorization
    const queryToken = req.query.token

    if ((!authHeader || !authHeader.startsWith('Bearer ')) && !queryToken) {
        return res.status(401).json({
            success: false,
            error: 'No token provided'
        })
    }

    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : queryToken

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        })
    }

    req.user = user
    next()
}

export default auth
