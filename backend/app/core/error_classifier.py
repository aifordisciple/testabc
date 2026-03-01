import re
from typing import Optional, Dict, Any, List
from enum import Enum
from pydantic import BaseModel


class ErrorType(Enum):
    INPUT_ERROR = "input_error"
    EXECUTION_ERROR = "execution_error"
    LOGIC_ERROR = "logic_error"
    SYSTEM_ERROR = "system_error"
    UNKNOWN_ERROR = "unknown_error"


class ErrorSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ClassifiedError(BaseModel):
    error_type: ErrorType
    severity: ErrorSeverity
    category: str
    message: str
    suggestion: str
    fix_code: Optional[str] = None
    related_files: List[str] = []


class ErrorClassifier:
    """
    错误分类器 - 分析错误并提供智能修复建议
    """

    def __init__(self):
        self.error_patterns = self._compile_patterns()

    def _compile_patterns(self) -> Dict[ErrorType, List[tuple]]:
        return {
            ErrorType.INPUT_ERROR: [
                (
                    r"FileNotFoundError.*['\"](.*?)['\"]",
                    "file_not_found",
                    "输入文件不存在",
                    "请检查文件路径是否正确，可用的输入文件列在下方"
                ),
                (
                    r"No such file or directory.*['\"](.*?)['\"]",
                    "file_not_found",
                    "文件或目录不存在",
                    "请检查路径是否正确"
                ),
                (
                    r"pandas\.errors\.EmptyDataError",
                    "empty_file",
                    "输入文件为空",
                    "请检查上传的文件是否为空"
                ),
                (
                    r"pandas\.errors\.ParserError",
                    "parse_error",
                    "文件格式解析错误",
                    "请检查文件格式是否正确 (CSV/TSV)"
                ),
                (
                    r"ValueError.*could not convert string to float",
                    "type_error",
                    "数据类型转换错误",
                    "请检查数据列的值是否为有效数字"
                ),
                (
                    r"KeyError.*['\"](.*?)['\"]",
                    "key_error",
                    "字典键不存在",
                    "请检查列名是否正确"
                ),
                (
                    r"IndexError.*list index out of range",
                    "index_error",
                    "索引越界",
                    "请检查数组或列表的索引是否超出范围"
                ),
            ],
            ErrorType.EXECUTION_ERROR: [
                (
                    r"TimeoutExpired.*(\d+) seconds",
                    "timeout",
                    "执行超时",
                    "代码执行时间超过限制，请优化代码或减少数据量"
                ),
                (
                    r"MemoryError",
                    "memory_error",
                    "内存不足",
                    "数据量太大导致内存不足，请尝试分批处理"
                ),
                (
                    r"OSError.*\[Errno 28\] No space left on device",
                    "disk_full",
                    "磁盘空间不足",
                    "请清理临时文件或释放磁盘空间"
                ),
                (
                    r"Process killed|SIGKILL",
                    "process_killed",
                    "进程被终止",
                    "可能因为内存超限或资源不足"
                ),
                (
                    r"Permission denied",
                    "permission_error",
                    "权限不足",
                    "请检查文件权限设置"
                ),
            ],
            ErrorType.LOGIC_ERROR: [
                (
                    r"ImportError.*No module named ['\"](.*?)['\"]",
                    "missing_module",
                    "缺少 Python 模块",
                    "需要安装缺失的模块: {module}"
                ),
                (
                    r"ModuleNotFoundError.*No module named ['\"](.*?)['\"]",
                    "missing_module",
                    "缺少 Python 模块",
                    "需要安装缺失的模块: {module}"
                ),
                (
                    r"AttributeError.*['\"](.*?)['\"]",
                    "attribute_error",
                    "对象没有该属性",
                    "请检查对象类型和属性名是否正确"
                ),
                (
                    r"TypeError.*unsupported operand.*['\"](\w+)['\"] and ['\"](\w+)['\"]",
                    "type_operation_error",
                    "不支持的操作类型",
                    "请检查操作的数据类型是否正确"
                ),
                (
                    r"ZeroDivisionError",
                    "division_by_zero",
                    "除数为零",
                    "请检查除数是否可能为零"
                ),
                (
                    r"NameError.*name ['\"](.*?)['\"] is not defined",
                    "undefined_variable",
                    "变量未定义",
                    "请确保所有变量在使用前都已定义"
                ),
                (
                    r"IndentationError",
                    "indentation_error",
                    "缩进错误",
                    "请检查代码缩进是否正确"
                ),
                (
                    r"SyntaxError",
                    "syntax_error",
                    "语法错误",
                    "请检查代码语法是否正确"
                ),
            ],
            ErrorType.SYSTEM_ERROR: [
                (
                    r"docker.*error",
                    "docker_error",
                    "Docker 执行错误",
                    "Docker 容器执行失败，请稍后重试或联系管理员"
                ),
                (
                    r"Connection refused|Connection reset",
                    "connection_error",
                    "网络连接错误",
                    "网络连接失败，请检查网络状态"
                ),
                (
                    r"HTTPError \d+",
                    "http_error",
                    "HTTP 请求错误",
                    "外部服务请求失败，请稍后重试"
                ),
            ],
        }

    def classify(self, error: Exception, stderr: str, stdout: str = "") -> ClassifiedError:
        error_str = f"{type(error).__name__}: {str(error)}"
        full_text = f"{error_str}\n{stderr}\n{stdout}"
        
        for error_type, patterns in self.error_patterns.items():
            for pattern, category, message, suggestion in patterns:
                match = re.search(pattern, full_text, re.IGNORECASE)
                if match:
                    groups = match.groups()
                    
                    final_suggestion = suggestion
                    if "{module}" in suggestion and "module" in category:
                        module_name = groups[0] if groups else "未知"
                        final_suggestion = suggestion.format(module=module_name)
                    
                    severity = self._estimate_severity(error_type, category)
                    
                    related_files = self._extract_file_paths(full_text)
                    
                    return ClassifiedError(
                        error_type=error_type,
                        severity=severity,
                        category=category,
                        message=message,
                        suggestion=final_suggestion,
                        related_files=related_files
                    )
        
        return ClassifiedError(
            error_type=ErrorType.UNKNOWN_ERROR,
            severity=ErrorSeverity.MEDIUM,
            category="unknown",
            message="未知错误",
            suggestion="请检查代码逻辑或查看完整错误信息",
            related_files=[]
        )

    def _estimate_severity(self, error_type: ErrorType, category: str) -> ErrorSeverity:
        if error_type == ErrorType.SYSTEM_ERROR:
            return ErrorSeverity.HIGH
        elif error_type == ErrorType.EXECUTION_ERROR:
            if category in ["timeout", "memory_error"]:
                return ErrorSeverity.HIGH
            return ErrorSeverity.MEDIUM
        elif error_type == ErrorType.INPUT_ERROR:
            return ErrorSeverity.LOW
        elif error_type == ErrorType.LOGIC_ERROR:
            return ErrorSeverity.MEDIUM
        return ErrorSeverity.MEDIUM

    def _extract_file_paths(self, text: str) -> List[str]:
        file_pattern = r"/?[\w/\-\_\.]+\.(py|csv|tsv|fastq|bam|vcf|bed|fa|fq)(\.gz)?"
        matches = re.findall(file_pattern, text, re.IGNORECASE)
        return list(set(matches))[:5]

    def format_error_message(self, classified: ClassifiedError, available_files: List[str] = None) -> str:
        severity_emoji = {
            ErrorSeverity.LOW: "ℹ️",
            ErrorSeverity.MEDIUM: "⚠️",
            ErrorSeverity.HIGH: "❌",
            ErrorSeverity.CRITICAL: "🔴"
        }
        
        emoji = severity_emoji.get(classified.severity, "❌")
        
        msg = f"### {emoji} 执行失败\n\n"
        msg += f"**错误类型**: {classified.message}\n\n"
        msg += f"**分类**: {classified.category}\n\n"
        msg += f"**建议**: {classified.suggestion}\n\n"
        
        if classified.related_files:
            msg += "**相关文件**:\n"
            for f in classified.related_files:
                msg += f"- `{f}`\n"
            msg += "\n"
        
        if available_files:
            msg += "**可用输入文件**:\n"
            for f in available_files[:10]:
                msg += f"- `{f}`\n"
        
        return msg


error_classifier = ErrorClassifier()
