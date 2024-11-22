import { Router } from 'express'
import {
  create,
  getAll,
  edit,
  remove,
  getById,
  getFormattedForTransfer,
  updateAfterTransfer
} from '../controllers/tempUser.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js'

const router = Router()

// 基本 CRUD 路由
router.post('/', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), create)
router.get('/all', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), getAll)
router.get('/:id', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), getById)
router.patch('/:id', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), edit)
router.delete('/:id', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), remove)

// 轉換相關路由
// 1. 獲取格式化後的轉換資料
router.get('/:id/formatted-for-transfer',
  auth.jwt,
  checkRole([UserRole.HR, UserRole.SUPER_ADMIN]),
  getFormattedForTransfer
)

// 2. 更新臨時員工狀態為已轉換
router.patch('/:tempUserId/update-after-transfer/:userId',
  auth.jwt,
  checkRole([UserRole.HR, UserRole.SUPER_ADMIN]),
  updateAfterTransfer
)

export default router
