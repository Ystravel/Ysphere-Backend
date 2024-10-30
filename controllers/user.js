import User from '../models/user.js';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import validator from 'validator';
import bcrypt from 'bcrypt';
import Sequence from '../models/sequence.js';
import AuditLog from '../models/auditLog.js';

const getNextSequence = async (name) => {
  const sequence = await Sequence.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return sequence.value;
};

// 新增用戶
export const create = async (req, res) => {
  try {
    const sequenceValue = await getNextSequence('user');
    const userId = `${String(sequenceValue).padStart(4, '0')}`;
    const result = await User.create({ ...req.body, userId, department: req.body.department });

    // 記錄創建異動
    await AuditLog.create({
      userId: req.user ? req.user._id : null,
      action: '創建',
      targetId: result._id,
      targetModel: 'users',
      changes: { ...req.body, userId }
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: '用戶創建成功',
      result
    });
  } catch (error) {
    handleError(res, error);
  }
};

// 用戶登入
export const login = async (req, res) => {
  try {
    const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7 days' })
    req.user.tokens.push(token)
    await req.user.save()
    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        token,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    })
  } catch (error) {
    console.error(error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '未知錯誤'
    })
  }
}

// Google 登入回調
export const googleCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect(`http://localhost:3000/login?message=${encodeURIComponent('此Email尚未註冊，請聯絡人資')}`);
    }

    const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7 days' });
    req.user.tokens.push(token);
    await req.user.save();

    res.redirect(`http://localhost:3000/login?token=${token}&email=${req.user.email}&avatar=${req.user.avatar}&name=${req.user.name}&role=${req.user.role}`);
  } catch (error) {
    console.error(error);
    res.redirect(`http://localhost:3000/login?message=${encodeURIComponent('未知錯誤，請稍後再試')}`);
  }
};

// 延長用戶登入 token
export const extend = async (req, res) => {
  try {
    const idx = req.user.tokens.findIndex(token => token === req.token);
    const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7 days' });
    req.user.tokens[idx] = token;
    await req.user.save();
    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: token
    });
  } catch (error) {
    handleError(res, error);
  }
};

// 取得當前用戶資料
export const profile = (req, res) => {
  try {
    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    });
  } catch (error) {
    handleError(res, error);
  }
};

// 取得所有用戶資料（包含分頁與排序）
export const getAll = async (req, res) => {
  try {
    const sortBy = req.query.sortBy || 'userId';
    const sortOrder = req.query.sortOrder || 'asc';
    const itemsPerPage = req.query.itemsPerPage * 1 || 10;
    const page = req.query.page * 1 || 1;
    const regex = new RegExp(req.query.search || '', 'i');
    const query = {
      $or: [
        { name: regex },
        { email: regex },
        { userId: regex }
      ]
    };

    const totalItems = await User.countDocuments(query);
    const data = await User
      .find(query)
      .populate('department', 'name')
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * itemsPerPage)
      .limit(itemsPerPage);

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data,
        totalItems,
        itemsPerPage,
        currentPage: page
      }
    });
  } catch (error) {
    console.log(error);
    handleError(res, error);
  }
};

// 用戶登出
export const logout = async (req, res) => {
  try {
    req.user.tokens = req.user.tokens.filter(token => token !== req.token);
    await req.user.save();

    // 記錄登出異動
    await AuditLog.create({
      userId: req.user._id,
      action: '登出',
      targetId: req.user._id,
      targetModel: 'users',
      changes: {}
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    handleError(res, error);
  }
};

// 編輯用戶資料（僅限管理員）
export const edit = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID');

    const updateData = { ...req.body };
    delete updateData.password;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).orFail(new Error('NOT FOUND'));

    // 記錄更新異動
    await AuditLog.create({
      userId: req.user._id,
      action: '修改',
      targetId: user._id,
      targetModel: 'users',
      changes: updateData
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: '用戶資料更新成功',
      result: user
    });
  } catch (error) {
    console.error(error);
    handleError(res, error);
  }
};

// 統一錯誤處理
const handleError = (res, error) => {
  if (error.name === 'ValidationError') {
    const key = Object.keys(error.errors)[0];
    const message = error.errors[key].message;
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message
    });
  } else if (error.name === 'MongoServerError' && error.code === 11000) {
    res.status(StatusCodes.CONFLICT).json({
      success: false,
      message: '此Email已註冊'
    });
  } else if (error.message === 'ID') {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: '用戶 ID 格式錯誤'
    });
  } else if (error.message === 'NOT FOUND') {
    res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: '查無用戶'
    });
  } else {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '未知錯誤'
    });
  }
};