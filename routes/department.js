import { Router } from 'express'
import { create, edit, getAll, getById, remove } from '../controllers/department.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js'

const router = Router()

// 創建部門（僅限 ADMIN 和 SUPER_ADMIN）
router.post('/', auth.jwt, checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]), create)

// 編輯部門（僅限 ADMIN 和 SUPER_ADMIN）
router.patch('/:id', auth.jwt, checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]), edit)

// 獲取所有部門列表（僅限已驗證的使用者）
router.get('/all', auth.jwt, getAll)

// 獲取單個部門資料（僅限已驗證的使用者）
router.get('/:id', auth.jwt, getById)

// 刪除部門（僅限 ADMIN 和 SUPER_ADMIN）
router.delete('/:id', auth.jwt, checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]), remove)

export default router
