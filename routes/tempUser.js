import { Router } from 'express'
import {
  create,
  getAll,
  edit,
  remove,
  getById,
  markAsTransferred,
  getFormattedForTransfer,
  updateAfterTransfer
} from '../controllers/tempUser.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js'

const router = Router()

router.post('/', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), create)
router.get('/all', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), getAll)
router.get('/:id', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), getById)
router.patch('/:id', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), edit)
router.delete('/:id', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), remove)

// 轉移相關路由
router.get('/:id/format-for-transfer', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), getFormattedForTransfer)
router.patch('/:tempUserId/mark-transferred/:userId', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), updateAfterTransfer)
router.patch('/:id/mark-as-transferred', auth.jwt, checkRole([UserRole.HR, UserRole.SUPER_ADMIN]), markAsTransferred)

export default router
