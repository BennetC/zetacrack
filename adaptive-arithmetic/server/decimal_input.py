"""The browser/backend exact-decimal lexical contract, without raw-data edits.

Trim precisely ECMAScript WhiteSpace + LineTerminator code points. Python's
default strip additionally accepts NEL/control separators and omits the BOM.
Keep the explicit set synchronized with web/src/domain.ts and boundary tests.
"""
from decimal import Decimal
from fractions import Fraction
import re

DECIMAL_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
DECIMAL_PATTERN = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)")


def decimal_lexeme(value):
    if not isinstance(value, str):
        raise ValueError("Invalid exact decimal")
    text = value.strip(DECIMAL_WHITESPACE)
    if not DECIMAL_PATTERN.fullmatch(text):
        raise ValueError("Invalid exact decimal")
    return text


def exact(value):
    return Fraction(Decimal(decimal_lexeme(value)))
