from dataclasses import dataclass
import numpy as np
from typing import Final
from enum import Enum
import random
import time


@dataclass
class pt:
    row: int = 0
    col: int = 0


@dataclass
class SaccadeState:
    goal_points: pt
    prev_points: pt


class policy_type(Enum):
    RANDOM = 0
    CONSTANT = 1
    SALIENCY = 2


def epoch_time_ms() -> int:
    return int(time.time() * 1000)


def sgn(val) -> int:
    return 1 if 0 < val else -1


def gradient_next_state(prev_state: pt, heatmap: np.ndarray) -> pt:
    x = prev_state.col
    y = prev_state.row
    # Sample around it
    n_samples = 30
    largest_x: int = x
    largest_y: int = y
    largest_val: float = heatmap[y, x]

    for i in range(n_samples):
        dx = random.randint(0, 30)
        dx *= -1 if random.getrandbits(1) else 1

        dy = random.randint(0, 30)
        dy *= -1 if random.getrandbits(1) else 1

        dx += x
        dy += y

        if dy > 0 and dy < heatmap.shape[0] and dx > 0 and dx < heatmap.shape[1]:
            sample_val: float = heatmap[dy, dx]
            if sample_val > largest_val:
                largest_val = sample_val
                largest_x = dx
                largest_y = dy
    # Take the largest value
    return pt(row=largest_y, col=largest_x)


class saccade_tool:
    def __init__(self, _n_points: int, op_code: policy_type):
        self.m_npts: Final[int] = _n_points
        self.m_op_code: Final[policy_type] = op_code
        self.m_is_initialized: bool = False
        self.m_last_update_ms: int = 0

        # Initialize the points
        self.states: list[SaccadeState] = [
            SaccadeState(pt(), pt()) for _ in range(self.m_npts)
        ]

    def update(self, image: np.ndarray) -> list[pt]:
        max_y: Final[int] = image.shape[0]
        max_x: Final[int] = image.shape[1]

        # Update the goals
        if not self.m_is_initialized:
            for state in self.states:
                state.goal_points.col = random.randint(0, max_x)
                state.goal_points.row = random.randint(0, max_y)

                state.prev_points.col = random.randint(0, max_x)
                state.prev_points.row = random.randint(0, max_y)

            self.m_last_update_ms = epoch_time_ms()
            self.m_is_initialized = True

        if self.m_op_code == policy_type.RANDOM:
            if epoch_time_ms() - self.m_last_update_ms > 3000:
                for state in self.states:
                    state.goal_points.col = random.randint(0, max_x)
                    state.goal_points.row = random.randint(0, max_y)
                self.m_last_update_ms = epoch_time_ms()
        elif self.m_op_code == policy_type.CONSTANT:
            pass
        elif self.m_op_code == policy_type.SALIENCY:
            for state in self.states:
                next_state: pt = gradient_next_state(state.goal_points, image)

                state.goal_points.row = next_state.row
                state.goal_points.col = next_state.col
        else:
            print("skipping, defaulting to constant\n")

        # move all of the points toward the goal points
        for state in self.states:
            dx = state.goal_points.col - state.prev_points.col
            dy = state.goal_points.row - state.prev_points.row

            dx = max(min(abs(dx) / 2, 13), 1) * sgn(dx)
            dy = max(min(abs(dy) / 2, 13), 1) * sgn(dy)

            state.prev_points.col += int(dx)
            state.prev_points.row += int(dy)
        return [
            pt(col=state.prev_points.col, row=state.prev_points.row)
            for state in self.states
        ]
