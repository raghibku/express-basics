import { Router } from "express";
import { userController } from "./user.controller.js";
import auth from "../../middleware/auth.js";
import { USER_ROLE } from "../../types/index.js";

const router = Router()




router.get("/",auth(USER_ROLE.admin, USER_ROLE.agent), userController.getAllUsers)

router.get("/:id",auth(USER_ROLE.admin, USER_ROLE.agent , USER_ROLE.user), userController.getUserById)

router.post("/", userController.createUser)

router.put("/:id", auth(USER_ROLE.admin , USER_ROLE.user) , userController.updateUserById)

router.delete("/:id",  userController.deleteUserById )

export const userRoute = router