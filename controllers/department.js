import Department from '../models/department.js';
import User from '../models/user.js';
import AuditLog from '../models/auditLog.js'; // 假設這是異動紀錄模型的路徑
import { StatusCodes } from 'http-status-codes';

export const create = async (req, res) => {
  try {
    const { name, companyId } = req.body;

    // 創建部門，需包含 companyId
    const department = await Department.create({ name, companyId });

    // 記錄創建異動
    await AuditLog.create({
      userId: req.user._id,
      action: '創建',
      targetId: department._id,
      targetModel: 'departments',
      changes: { name, companyId }
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門創建成功',
      result: department
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '創建部門時發生錯誤',
      error: error.message
    });
  }
};

export const edit = async (req, res) => {
  try {
    const { name, companyId } = req.body;

    // 更新部門，確保提供了正確的 companyId
    const department = await Department.findByIdAndUpdate(
      req.params.id,
      { name, companyId },
      { new: true }
    );

    // 記錄更新異動
    await AuditLog.create({
      userId: req.user._id,
      action: '修改',
      targetId: department._id,
      targetModel: 'departments',
      changes: { name, companyId }
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門更新成功',
      result: department
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '更新部門時發生錯誤',
      error: error.message
    });
  }
};

export const getAll = async (req, res) => {
  try {
    // 查詢所有部門，並包含公司資料
    const departments = await Department.find().populate('companyId', 'name');

    res.status(StatusCodes.OK).json({
      success: true,
      message: '獲取部門列表成功',
      result: departments
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取部門列表時發生錯誤',
      error: error.message
    });
  }
};

export const remove = async (req, res) => {
  try {
    const department = await Department.findByIdAndDelete(req.params.id);

    if (!department) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到指定的部門'
      });
    }

    // 將所有與此部門相關聯的使用者的 department 設置為 null
    await User.updateMany({ department: req.params.id }, { department: null });

    // 記錄刪除異動
    await AuditLog.create({
      userId: req.user._id,
      action: '刪除',
      targetId: department._id,
      targetModel: 'departments',
      changes: { name: department.name, companyId: department.companyId }
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: '部門刪除成功，所有相關使用者的部門已設為空'
    });
  } catch (error) {Q
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '刪除部門時發生錯誤',
      error: error.message
    });
  }
};