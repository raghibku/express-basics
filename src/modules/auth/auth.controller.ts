import type { Request , Response} from "express";
import { authService } from "./auth.service.js";
import sendResponse from "../../utils/sendResponse.js";

const loginUser = async(req:Request , res: Response) => {
    try {
        const result = await authService.loginUserIntoDB(req.body);
        const {refreshToken} = result
        res.cookie("refreshToken",refreshToken,{
            secure : false, // http -> false , https -> true , 
            httpOnly : true, // prevent xss attack
            sameSite : "lax", // "none" , "strict" , "lax" -> csrf
            // maxAge : ""
            path : "/",
            domain : "localhost", // example.com
        })
        // res.status(200).json({
        //     success:true,
        //     message: "User Login Successfull",
        //     data: result,
        // })
        sendResponse(res,{
            statusCode : 200,
            success : true,
            message: "User Login Successfull",
            data : result
        })
    } catch (error : any) {
        // res.status(500).json({
        //     "success" : false,
        //     "message" : error?.message,
        //     "error": error
        // })
        sendResponse(res,{
            statusCode : 500,
            success : false,
            message: error?.message,
            error : error
        })
    }
}

const generateToken = async(req:Request , res: Response) => {
    try {
        const result = await authService.generateAccessToken(req.cookies.refreshToken)
        res.status(200).json({
            success:true,
            message: "Access token generated successfully",
            data: result,
        })
        
    } catch (error : any) {
        res.status(500).json({
            "success" : false,
            "message" : error?.message,
            "error": error
        })
    }
}

export const authController = {
    loginUser ,
    generateToken
}