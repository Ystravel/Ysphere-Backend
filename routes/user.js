import { Router } from 'express'
import {
  create,
  getAll,
  edit,
  login,
  // extend,
  logout,
  profile,
  googleLogin,
  changePassword,
  getEmployeeStats,
  forgotPassword,
  resetPassword,
  updateAvatar,
  remove,
  getSuggestions,
  sendInitialPassword,
  revealCowell,
  search
} from '../controllers/user.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js'
import upload from '../middlewares/upload.js'

const router = Router()

// 登入路由
router.post('/login', auth.login, login)

// 用戶註冊（僅限 ADMIN 和 SUPER_ADMIN）
router.post('/', auth.jwt, checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.HR]), create)

// 延長登入 token
// router.patch('/extend', auth.jwt, extend)

router.patch('/change-password', auth.jwt, changePassword)
// 取得所有用戶資料（僅限 ADMIN 和 SUPER_ADMIN）
router.get('/all', auth.jwt, checkRole([UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.IT]), getAll)

// 取得當前用戶資料
router.get('/profile', auth.jwt, profile)
router.get('/employee-stats', auth.jwt, checkRole([UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN]), getEmployeeStats)
router.get('/suggestions', auth.jwt, checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.IT]), getSuggestions)
router.get('/search', auth.jwt, checkRole([UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN]), search)

// 用戶登出
router.delete('/logout', auth.jwt, logout)

// Google 登入
router.post('/google-login', googleLogin)
router.post('/:id/send-initial-password',
  auth.jwt,
  checkRole([UserRole.HR, UserRole.SUPER_ADMIN]),
  sendInitialPassword
)

router.post('/reveal-cowell', auth.jwt, revealCowell)

// 編輯用戶資料（僅限 ADMIN 和 SUPER_ADMIN）
router.patch('/avatar', auth.jwt, upload, updateAvatar)

router.patch('/:id', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), edit)

router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)

router.delete('/:id', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), remove)

export default router
