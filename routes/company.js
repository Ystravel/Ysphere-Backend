import { Router } from 'express'
import { create, edit, remove, getAll } from '../controllers/company.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js' // 引入角色枚舉

const router = Router()

// 創建公司（僅限 ADMIN 和 SUPER_ADMIN）
router.post('/', auth.jwt, checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]), create)

// 編輯公司（僅限 ADMIN 和 SUPER_ADMIN）
router.patch('/:id', auth.jwt, checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]), edit)

// 獲取公司列表（允許 HR, MANAGER, ADMIN, SUPER_ADMIN）
router.get('/all', auth.jwt, checkRole([UserRole.HR, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]), getAll)

// 刪除公司（僅限 SUPER_ADMIN）
router.delete('/:id', auth.jwt, checkRole([UserRole.SUPER_ADMIN]), remove)

export default router
