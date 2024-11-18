import { Router } from 'express'
import { create, edit, getAll, remove } from '../controllers/company.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js'

const router = Router()

// 創建公司（僅限 SUPER_ADMIN）
router.post('/', auth.jwt, checkRole([UserRole.SUPER_ADMIN]), create)

// 編輯公司（僅限 SUPER_ADMIN）
router.patch('/:id', auth.jwt, checkRole([UserRole.SUPER_ADMIN]), edit)

// 獲取所有公司列表（僅限已驗證的使用者）
router.get('/all', auth.jwt, getAll)

// 刪除公司（僅限 SUPER_ADMIN）
router.delete('/:id', auth.jwt, checkRole([UserRole.SUPER_ADMIN]), remove)

export default router
