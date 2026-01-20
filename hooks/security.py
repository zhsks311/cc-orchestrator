"""
Security Module - Input validation, sensitive data masking, LLM response validation
"""
import re
import json
from typing import Dict, Any, List, Optional
from pathlib import Path


class SecurityValidator:
    def __init__(self, config: Dict[str, Any]):
        security_config = config.get("security", {})
        self.mask_sensitive = security_config.get("mask_sensitive_data", True)
        self.allowed_extensions = security_config.get("allowed_file_extensions", [])
        self.sensitive_patterns = security_config.get("sensitive_patterns", [
            "password", "api_key", "secret", "token", "credential",
            "private_key", "access_key", "auth_token"
        ])
        self.validate_response = security_config.get("validate_llm_response", True)

    def validate_file_path(self, file_path: str) -> bool:
        """Validate if file extension is allowed"""
        if not self.allowed_extensions:
            return True
        path = Path(file_path)
        return path.suffix.lower() in self.allowed_extensions

    def mask_sensitive_data(self, content: str) -> str:
        """Mask sensitive info patterns"""
        if not self.mask_sensitive:
            return content

        masked = content
        for pattern in self.sensitive_patterns:
            # Mask key=value format
            regex = rf'({pattern}\s*[=:]\s*)["\']?([^"\'\s\n]+)["\']?'
            masked = re.sub(regex, r'\1***MASKED***', masked, flags=re.IGNORECASE)

            # Mask JSON format
            json_regex = rf'("{pattern}"\s*:\s*)["\']([^"\']+)["\']'
            masked = re.sub(json_regex, r'\1"***MASKED***"', masked, flags=re.IGNORECASE)

        return masked

    def sanitize_input(self, text: str) -> str:
        """Sanitize input to prevent command injection"""
        # Escape shell metacharacters
        dangerous_chars = ['`', '$', '$(', '${', ';', '&&', '||', '|', '>', '<', '\n']
        sanitized = text
        for char in dangerous_chars:
            sanitized = sanitized.replace(char, '')
        return sanitized

    def validate_llm_response(self, response: str) -> Dict[str, Any]:
        """Validate if LLM response is valid JSON format"""
        if not self.validate_response:
            return {"valid": True, "data": response}

        try:
            data = json.loads(response)

            # Required field validation
            required_fields = ["severity", "issues"]
            for field in required_fields:
                if field not in data:
                    return {
                        "valid": False,
                        "error": f"Missing required field: {field}",
                        "data": None
                    }

            # Severity value validation
            valid_severities = ["OK", "LOW", "MEDIUM", "HIGH", "CRITICAL"]
            if data["severity"] not in valid_severities:
                return {
                    "valid": False,
                    "error": f"Invalid severity: {data['severity']}",
                    "data": None
                }

            return {"valid": True, "data": data}

        except json.JSONDecodeError as e:
            return {
                "valid": False,
                "error": f"Invalid JSON: {str(e)}",
                "data": None
            }

    def extract_code_safely(self, tool_input: Dict[str, Any]) -> Optional[str]:
        """Safely extract code from tool input"""
        code = None

        # For Edit tool
        if "new_string" in tool_input:
            code = tool_input.get("new_string", "")
        # For Write tool
        elif "content" in tool_input:
            code = tool_input.get("content", "")

        if code:
            return self.mask_sensitive_data(code)
        return None


def load_config() -> Dict[str, Any]:
    """Load config file"""
    config_path = Path("~/.claude/hooks/config.json").expanduser()
    if config_path.exists():
        try:
            return json.loads(config_path.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


# Global instance
_validator: Optional[SecurityValidator] = None

def get_security_validator() -> SecurityValidator:
    global _validator
    if _validator is None:
        config = load_config()
        _validator = SecurityValidator(config)
    return _validator
