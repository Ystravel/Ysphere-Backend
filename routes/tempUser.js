// routes/tempUser.js
import { Router } from 'express'
import {
  create,
  getAll,
  edit,
  remove,
  convertToFormalUser
} from '../controllers/tempUser.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js'

const router = Router()

// 設定允許存取的角色
const allowedRoles = [UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN]

// 基本的 CRUD 操作路由
router.post('/',
  auth.jwt,
  checkRole(allowedRoles),
  create
)

router.get('/all',
  auth.jwt,
  checkRole(allowedRoles),
  getAll
)

router.patch('/:id',
  auth.jwt,
  checkRole(allowedRoles),
  edit
)

router.delete('/:id',
  auth.jwt,
  checkRole(allowedRoles),
  remove
)

// 特殊功能：轉換為正式員工
router.post('/:tempUserId/convert',
  auth.jwt,
  checkRole(allowedRoles),
  convertToFormalUser
)

export default router
