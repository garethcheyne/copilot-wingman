"""Wingman Python SDK — scaffold.

The full client is not yet implemented. See the Node SDK at sdk/node for the
reference implementation, and sdk/python/README.md for the planned API.
"""

__version__ = "0.0.1"


class _NotImplementedYet:
    def __init__(self, *_, **__):
        raise NotImplementedError(
            "wingman-sdk for Python is not yet implemented. "
            "See sdk/node for the working reference client."
        )


# Placeholder so `from wingman import Wingman` doesn't ImportError outright.
Wingman = _NotImplementedYet
