import { Router } from 'express'
import {
  create,
  getAll,
  edit,
  login,
  extend,
  logout,
  profile,
  googleCallback
} from '../controllers/user.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js'
import passport from 'passport'

const router = Router()

// 登入路由
router.post('/login', auth.login, login)

// 用戶註冊（僅限 ADMIN 和 SUPER_ADMIN）
router.post('/', auth.jwt, checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]), create)

// 延長登入 token
router.patch('/extend', auth.jwt, extend)

// 取得所有用戶資料（僅限 ADMIN 和 SUPER_ADMIN）
router.get('/all', auth.jwt, checkRole([UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN]), getAll)

// 取得當前用戶資料
router.get('/profile', auth.jwt, profile)

// 用戶登出
router.delete('/logout', auth.jwt, logout)

// Google 登入相關路由
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
router.get('/auth/google/callback', auth.googleLogin, googleCallback)

// 編輯用戶資料（僅限 ADMIN 和 SUPER_ADMIN）
router.patch('/:id', auth.jwt, checkRole([UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN]), edit)

export default router
