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
router.get('/home', auth.jwt, getHomeAnnouncements) // 獲取首頁公告列表
router.get('/:id', auth.jwt, getOne) // 獲取單一公告詳情

// 需要特定權限的路由
// HR, ADMIN, SUPER_ADMIN 可以管理公告
router.post('/',
  auth.jwt,
  checkRole([UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER]),
  announcementUpload,
  create
)

router.get('/all',
  auth.jwt,
  getAll
)

router.patch('/:id',
  auth.jwt,
  checkRole([UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER]),
  announcementUpload,
  update
)

router.delete('/:id',
  auth.jwt,
  checkRole([UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER]),
  remove
)

// 附件管理路由
router.delete('/:id/attachments/:attachmentId',
  auth.jwt,
  checkRole([UserRole.HR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER]),
  deleteAttachment
)

export default router
