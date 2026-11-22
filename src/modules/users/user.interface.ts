export interface IUser{
    name : string;
    email : string;
    password : string;
    age? : number | null; 
    role? : string | null; 
}

export type IUpdateUser = Partial<Pick<IUser , "name" | "password" | "age"> & { is_Active?:boolean} >