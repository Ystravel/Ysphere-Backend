import { Router } from 'express'
import {
  create,
  getAll,
  getOne,
  update,
  remove,
  getHomeAnnouncements,
  deleteAttachment
} from '../controllers/announcement.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js'
import announcementUpload from '../middlewares/announcementUpload.js'

const router = Router()

// 公開路由（需要登入但不需要特定權限）
router.get('/all', auth.jwt, getAll)
router.get('/home', auth.jwt, getHomeAnnouncements)
router.get('/:id', auth.jwt, getOne)

// 需要管理權限的路由 (ADMIN 或以上)
router.post('/',
  auth.jwt,
  checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.HR]),
  announcementUpload,
  create
)

router.patch('/:id',
  auth.jwt,
  checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.HR]),
  announcementUpload,
  update
)

router.delete('/:id',
  auth.jwt,
  checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.HR]),
  remove
)

// 附件管理路由
router.delete('/:id/attachments/:attachmentId',
  auth.jwt,
  checkRole([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.HR]),
  deleteAttachment
)

export default router
