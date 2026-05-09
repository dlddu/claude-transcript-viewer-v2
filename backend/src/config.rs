use std::env;

pub struct ServerConfig {
    pub port: u16,
}

impl ServerConfig {
    pub fn from_env() -> Self {
        let port = env::var("PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(3000);
        Self { port }
    }
}
