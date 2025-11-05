import pool from '../config/database.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';

class RedeemController {
  // Get all available gift cards
  static async getGiftCards(req, res) {
    try {
      const result = await pool.query(
        `SELECT card_id, card_name, card_brand, card_value, coins_required, card_image
         FROM gift_cards
         WHERE is_active = true
         ORDER BY card_value ASC`
      );

      return successResponse(res, 200, 'Gift cards fetched successfully', {
        giftCards: result.rows
      });

    } catch (error) {
      console.error('Get gift cards error:', error);
      return errorResponse(res, 500, 'Failed to fetch gift cards');
    }
  }

  // Create redeem request
  static async createRedeemRequest(req, res) {
    const client = await pool.connect();

    try {
      const userId = req.user.userId;
      const { cardId, deliveryEmail } = req.body;

      if (!cardId) {
        return errorResponse(res, 400, 'Card ID is required');
      }

      // Get user details
      const userResult = await client.query(
        `SELECT u.email, p.full_name, w.available_coins
         FROM users u
         JOIN user_profiles p ON u.user_id = p.user_id
         JOIN user_wallets w ON u.user_id = w.user_id
         WHERE u.user_id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        return errorResponse(res, 404, 'User not found');
      }

      const user = userResult.rows[0];
      const finalEmail = deliveryEmail || user.email; // Use provided or default

      // Get gift card details
      const cardResult = await client.query(
        `SELECT * FROM gift_cards WHERE card_id = $1 AND is_active = true`,
        [cardId]
      );

      if (cardResult.rows.length === 0) {
        return errorResponse(res, 404, 'Gift card not found');
      }

      const card = cardResult.rows[0];

      // Check if user has enough coins
      if (user.available_coins < card.coins_required) {
        return errorResponse(res, 400, 
          `Insufficient coins. You need ${card.coins_required} coins but have ${user.available_coins}`
        );
      }

      await client.query('BEGIN');

      // Deduct coins from user wallet
      await client.query(
        `UPDATE user_wallets
         SET available_coins = available_coins - $2,
             total_redeemed = total_redeemed + $2,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, card.coins_required]
      );

      // Create redeem request
      const redeemResult = await client.query(
        `INSERT INTO redeem_requests (
          user_id, card_id, user_name, user_email, delivery_email,
          card_name, card_brand, card_value, coins_redeemed, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING request_id, requested_at`,
        [
          userId,
          cardId,
          user.full_name,
          user.email,
          finalEmail,
          card.card_name,
          card.card_brand,
          card.card_value,
          card.coins_required
        ]
      );

      // Log transaction
      const walletResult = await client.query(
        'SELECT available_coins FROM user_wallets WHERE user_id = $1',
        [userId]
      );

      await client.query(
        `INSERT INTO coin_transactions (
          user_id, transaction_type, amount, balance_after, 
          source, description
        ) VALUES ($1, 'redeemed', $2, $3, 'gift_card', $4)`,
        [
          userId,
          -card.coins_required,
          walletResult.rows[0].available_coins,
          `Redeemed ${card.card_name}`
        ]
      );

      await client.query('COMMIT');

      return successResponse(res, 201, 
        '🎉 Redeem request submitted! Admin will send the gift code to your email within 24-48 hours.',
        {
          requestId: redeemResult.rows[0].request_id,
          requestedAt: redeemResult.rows[0].requested_at,
          cardName: card.card_name,
          coinsRedeemed: card.coins_required,
          deliveryEmail: finalEmail
        }
      );

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create redeem request error:', error);
      return errorResponse(res, 500, 'Failed to create redeem request');
    } finally {
      client.release();
    }
  }

  // Get user's redeem history
  static async getUserRedeemHistory(req, res) {
    try {
      const userId = req.user.userId;

      const result = await pool.query(
        `SELECT 
          request_id,
          card_name,
          card_brand,
          card_value,
          coins_redeemed,
          delivery_email,
          status,
          gift_code,
          admin_notes,
          requested_at,
          processed_at,
          completed_at
         FROM redeem_requests
         WHERE user_id = $1
         ORDER BY requested_at DESC`,
        [userId]
      );

      return successResponse(res, 200, 'Redeem history fetched successfully', {
        totalRequests: result.rows.length,
        redeemHistory: result.rows
      });

    } catch (error) {
      console.error('Get redeem history error:', error);
      return errorResponse(res, 500, 'Failed to fetch redeem history');
    }
  }

  // ===== ADMIN ENDPOINTS =====

  // Get all redeem requests (Admin only)
  static async getAllRedeemRequests(req, res) {
    try {
      const { status = 'all', page = 1, limit = 20 } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      let whereClause = '';
      const params = [];

      if (status !== 'all') {
        whereClause = 'WHERE r.status = $1';
        params.push(status);
      }

      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM redeem_requests r ${whereClause}`,
        params
      );

      const result = await pool.query(
        `SELECT 
          r.*,
          u.email as user_email,
          p.full_name as user_name,
          p.phone as user_phone
         FROM redeem_requests r
         JOIN users u ON r.user_id = u.user_id
         JOIN user_profiles p ON r.user_id = p.user_id
         ${whereClause}
         ORDER BY 
           CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
           r.requested_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      );

      return successResponse(res, 200, 'Redeem requests fetched successfully', {
        totalRequests: parseInt(countResult.rows[0].total),
        currentPage: parseInt(page),
        totalPages: Math.ceil(countResult.rows[0].total / parseInt(limit)),
        requests: result.rows
      });

    } catch (error) {
      console.error('Get all redeem requests error:', error);
      return errorResponse(res, 500, 'Failed to fetch redeem requests');
    }
  }

  // Update redeem request status (Admin only)
  static async updateRedeemRequest(req, res) {
    const client = await pool.connect();

    try {
      const adminId = req.user.userId;
      const { requestId } = req.params;
      const { status, giftCode, adminNotes } = req.body;

      if (!status) {
        return errorResponse(res, 400, 'Status is required');
      }

      if (!['approved', 'rejected', 'completed'].includes(status)) {
        return errorResponse(res, 400, 'Invalid status');
      }

      // Get request details
      const requestResult = await client.query(
        `SELECT * FROM redeem_requests WHERE request_id = $1`,
        [requestId]
      );

      if (requestResult.rows.length === 0) {
        return errorResponse(res, 404, 'Redeem request not found');
      }

      const request = requestResult.rows[0];

      await client.query('BEGIN');

      // If rejected, refund coins to user
      if (status === 'rejected' && request.status === 'pending') {
        await client.query(
          `UPDATE user_wallets
           SET available_coins = available_coins + $2,
               total_redeemed = total_redeemed - $2,
               updated_at = NOW()
           WHERE user_id = $1`,
          [request.user_id, request.coins_redeemed]
        );

        // Log refund transaction
        const walletResult = await client.query(
          'SELECT available_coins FROM user_wallets WHERE user_id = $1',
          [request.user_id]
        );

        await client.query(
          `INSERT INTO coin_transactions (
            user_id, transaction_type, amount, balance_after, 
            source, description
          ) VALUES ($1, 'refund', $2, $3, 'redeem_rejected', $4)`,
          [
            request.user_id,
            request.coins_redeemed,
            walletResult.rows[0].available_coins,
            `Refund for rejected ${request.card_name}`
          ]
        );
      }

      // Update request
      await client.query(
        `UPDATE redeem_requests
         SET status = $2,
             gift_code = $3,
             admin_notes = $4,
             processed_by = $5,
             processed_at = NOW(),
             completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
         WHERE request_id = $1`,
        [requestId, status, giftCode || null, adminNotes || null, adminId]
      );

      await client.query('COMMIT');

      return successResponse(res, 200, 
        `Redeem request ${status} successfully`,
        {
          requestId,
          status,
          processedAt: new Date()
        }
      );

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update redeem request error:', error);
      return errorResponse(res, 500, 'Failed to update redeem request');
    } finally {
      client.release();
    }
  }

  // Get redeem statistics (Admin only)
  static async getRedeemStats(req, res) {
    try {
      const statsResult = await pool.query(
        `SELECT 
          COUNT(*) as total_requests,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_requests,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_requests,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_requests,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_requests,
          COALESCE(SUM(coins_redeemed), 0) as total_coins_redeemed,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN card_value ELSE 0 END), 0) as total_value_completed
         FROM redeem_requests`
      );

      const topCardsResult = await pool.query(
        `SELECT 
          card_name,
          card_value,
          COUNT(*) as request_count,
          SUM(coins_redeemed) as total_coins
         FROM redeem_requests
         WHERE status IN ('completed', 'approved')
         GROUP BY card_name, card_value
         ORDER BY request_count DESC
         LIMIT 5`
      );

      return successResponse(res, 200, 'Redeem statistics fetched successfully', {
        stats: statsResult.rows[0],
        topCards: topCardsResult.rows
      });

    } catch (error) {
      console.error('Get redeem stats error:', error);
      return errorResponse(res, 500, 'Failed to fetch statistics');
    }
  }
}

export default RedeemController;