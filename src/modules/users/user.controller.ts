import type { Request, Response } from "express";
import { userService } from "./user.service.js";

const createUser = async (req: Request, res: Response) => {
    try {
        const result = await userService.createUserIntoDB(req.body)
        res.status(201).json({
            success: true,
            message: "User created",
            data: result.rows[0]
        })
    } catch (error: any) {
        res.status(500).json({
            success: true,
            message: error?.message,
            error: error,
        })
    }

}

const getAllUsers = async (req: Request, res: Response) => {
    try {
        const result = await userService.getAllUsersFromDB()
        console.log("From Controller" , req.user)
        res.status(200).json({
            success: true,
            message: "Got All the USERS",
            data: result.rows
        })
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error?.message,
            error: error,
        })
    }
}

const getUserById = async (req: Request, res: Response) => {
    try {
        const {id}  = req.params;
        const result = await userService.getUserByIdFromDB(id as string)
        if (result.rows.length > 0) {
            res.status(200).json({
                success: true,
                message: "User found",
                data: result.rows[0]
            })
        } else {
            res.status(404).json({
                success: false,
                message: "User Not found",
            })
        }

    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error?.message,
            error: error,
        })
    }
}

const updateUserById = async (req: Request, res: Response) => {
    try {
        const {id} = req.params;
        const result = await userService.updateUserByIdInDB(req.body , id as string )
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.status(200).json({
            success: true,
            message: "User updated successfully!",
            data: result.rows
        })
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error?.message,
            error: error,
        })
    }
}

const deleteUserById =  async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await userService.deleteUserByIdInDB(id as string)
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.status(200).json({
            success: true,
            message: "User deleted successfully!"
        })
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error?.message,
            error: error,
        })
    }
}

export const userController = {
    createUser,
    getAllUsers,
    getUserById,
    updateUserById, 
    deleteUserById
}