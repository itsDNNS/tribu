import asyncio
from inspect import iscoroutinefunction


def patch_asyncio_iscoroutinefunction() -> None:
    """Provide a non-deprecated coroutine checker for dependencies.

    slowapi still calls ``asyncio.iscoroutinefunction`` which emits a
    deprecation warning on Python 3.14+ and is scheduled for removal.
    Rebinding it to ``inspect.iscoroutinefunction`` preserves behavior
    while keeping test and runtime logs clean.
    """
    if getattr(asyncio, "iscoroutinefunction", None) is not iscoroutinefunction:
        asyncio.iscoroutinefunction = iscoroutinefunction
