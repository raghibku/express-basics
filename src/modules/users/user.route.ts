import { Router } from "express";
import { userController } from "./user.controller.js";
import auth from "../../middleware/auth.js";

const router = Router()


router.get("/",auth, userController.getAllUsers)

router.get("/:id", userController.getUserById)

router.post("/", userController.createUser)

router.put("/:id", userController.updateUserById)

router.delete("/:id",  userController.deleteUserById )

export const userRoute = router