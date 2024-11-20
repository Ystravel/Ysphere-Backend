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
      } else if (info.message === '密碼錯誤' && user && user.isFirstLogin) {
        // 修改這裡：當密碼錯誤且是首次登入時，返回首次登入的提示
        res.status(StatusCodes.FORBIDDEN).json({
          success: false,
          message: '您是初次登入，請使用初始密碼登入'
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

    // 檢查員工任職狀態
    if (user.employmentStatus !== '在職') {
      res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
      return
    }

    req.user = user
    next()
  })(req, res, next)
}

export const jwt = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (error, data, info) => {
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

    // 檢查員工任職狀態
    if (data.user.employmentStatus !== '在職') {
      res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
      return
    }

    req.user = data.user
    req.token = data.token
    next()
  })(req, res, next)
}
