import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import notificationReadService from "../services/notification-read.service.js";

const router = Router();

// Every notification endpoint requires an authenticated user.
router.use(requireAuth);

// GET /api/v1/notifications
router.get("/", async (req, res, next) => {
  try {
    const notifications =
      await notificationReadService.listNotifications(req.user.id);

    res.status(200).json({ notifications });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/notifications/unread-count
router.get("/unread-count", async (req, res, next) => {
  try {
    const unreadCount =
      await notificationReadService.getUnreadCount(req.user.id);

    res.status(200).json({ unreadCount });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/notifications/read-all
router.patch("/read-all", async (req, res, next) => {
  try {
    const result =
      await notificationReadService.markAllNotificationsRead(req.user.id);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/notifications/:notificationId/read
router.patch("/:notificationId/read", async (req, res, next) => {
  try {
    const result = await notificationReadService.markNotificationRead(
      req.params.notificationId,
      req.user.id,
    );

    res.status(200).json(result);
  } catch (error) {
    if (error.status === 404 && error.code === "NOT_FOUND") {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Notification not found",
        },
      });
    }

    next(error);
  }
});

export default router;