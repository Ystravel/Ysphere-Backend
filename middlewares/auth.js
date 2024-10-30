import passport from 'passport'
import { StatusCodes } from 'http-status-codes'
import jsonwebtoken from 'jsonwebtoken'

export const login = (req, res, next) => {
  passport.authenticate('login', { session: false }, (error, user, info) => {
    if (!user || error) {
      if (info.message === 'Missing credentials') {
        res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '請輸入帳號密碼'
        })
        return
      } else if (info.message === '未知錯誤') {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: '未知錯誤'
        })
        return
      } else {
        res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: info.message
        })
        return
      }
    }
    req.user = user
    next()
  })(req, res, next)
}

export const jwt = (req, res, next) => {
  // console.log('JWT middleware called')
  passport.authenticate('jwt', { session: false }, (error, data, info) => {
    // console.log('JWT authentication result:', { error, data, info })
    if (error || !data) {
      if (info instanceof jsonwebtoken.JsonWebTokenError) {
        res.status(StatusCodes.UNAUTHORIZED).json({
          success: false,
          message: '登入無效'
        })
      } else if (info.message === '未知錯誤') {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: '未知錯誤'
        })
      } else {
        res.status(StatusCodes.UNAUTHORIZED).json({
          success: false,
          message: info.message
        })
      }
      return
    }
    req.user = data.user
    req.token = data.token
    // console.log('JWT authentication successful')
    next()
  })(req, res, next)
}

// googleLogin 中的處理
export const googleLogin = (req, res, next) => {
  passport.authenticate('google', { session: false }, (error, user, info) => {
    if (!user || error) {
      // 用戶不存在，重定向回前端並顯示錯誤訊息
      return res.redirect(`http://localhost:3000/login?message=${encodeURIComponent(info?.message || '')}`)
    }
    req.user = user
    next() // 認證成功，繼續處理 callback 邏輯
  })(req, res, next)
}
