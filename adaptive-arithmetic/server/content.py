"""Exact immutable custom-content provenance checks, without float rounding."""
from server.decimal_input import exact


def grid(bounds):
    precision = bounds["decimalPlaces"]
    if type(precision) is not int or not 0 <= precision <= 3:
        raise ValueError("Invalid precision")
    scale = 10 ** precision
    low, high = exact(bounds["min"]) * scale, exact(bounds["max"]) * scale
    if low.denominator != 1 or high.denominator != 1 or low > high:
        raise ValueError("Invalid grid bounds")
    return int(low), int(high), precision


def floor_sum(n, m, a, b):
    total = 0
    while True:
        if a >= m:
            total += (n - 1) * n * (a // m) // 2
            a %= m
        if b >= m:
            total += n * (b // m)
            b %= m
        y = a * n + b
        if y < m:
            return total
        n, b, m, a = y // m, y % m, a, m


def valid_pair_count(operation, group):
    low_a, high_a, precision_a = grid(group["first"])
    low_b, high_b, precision_b = grid(group["second"])
    count_a, count_b = high_a - low_a + 1, high_b - low_b + 1
    if operation == "division":
        return (count_a - (low_a <= 0 <= high_a)) * count_b
    if operation != "subtraction" or group["allowNegative"]:
        return count_a * count_b
    precision = max(precision_a, precision_b)
    step_a, step_b = 10 ** (precision - precision_a), 10 ** (precision - precision_b)
    a, b = low_a * step_a, low_b * step_b
    clamp = lambda n: max(0, min(count_a, n))
    start = clamp((b - a + step_a - 1) // step_a)
    full = clamp((b + (count_b - 1) * step_b - a + step_a - 1) // step_a)
    middle = full - start
    return (floor_sum(middle, step_b, step_a, a - b + start * step_a) + middle if middle else 0) + (count_a - full) * count_b


def custom_trace_valid(config, question):
    try:
        operation = next(op for op in config["operations"] if op["id"] == question["operation"])
        group = next(g for g in operation["groups"] if g["id"] == question["groupId"])
        first = exact(question["right"] if operation["id"] == "division" else question["left"])
        second = exact(question["expected"] if operation["id"] == "division" else question["right"])
        for value, bounds in ((first, group["first"]), (second, group["second"])):
            low, high, precision = grid(bounds)
            scaled = value * 10 ** precision
            if scaled.denominator != 1 or not low <= scaled <= high:
                return False
        if operation["id"] == "subtraction" and not group["allowNegative"] and first < second:
            return False
        selection = question.get("selection")
        operation_bp, group_bp = exact(operation["share"]) * 100, exact(group["share"]) * 100
        return (operation_bp > 0 and group_bp > 0 and isinstance(selection, dict) and
                selection.get("operationBasisPoints") == operation_bp and selection.get("groupBasisPoints") == group_bp and
                selection.get("validPairCount") == str(valid_pair_count(operation["id"], group)))
    except (KeyError, TypeError, ValueError, ArithmeticError, StopIteration):
        return False
