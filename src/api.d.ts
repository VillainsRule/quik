export interface GenericError {
    success: false;
    errors: { message: string }[];
}

export interface TunnelConfigResult {
    success: true;
    result: {
        config: {
            ingress: ({
                service: string;
                hostname: string;
                originRequest: {};
            } | { service: 'http_status:404' })[];
        }
    }
}