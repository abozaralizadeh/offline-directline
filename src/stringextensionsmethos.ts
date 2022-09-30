export {};

declare global { 
    const bearerStirng = "Bearer ";

    interface String {
        GetAuthToken(): string;
    }
}


String.prototype.GetAuthToken = function (): string {
    if(this.includes(bearerStirng)){
        return this.replace(bearerStirng, "");
    }
    
    return this;
};