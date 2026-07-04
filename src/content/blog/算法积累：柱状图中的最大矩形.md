---
title: '算法积累：柱状图中的最大矩形'
description: 'leetcode 84 题柱状图中的最大矩形，单调栈的典型例题'
pubDate: 'July 4 2026'
heroImage: '../../assets/blog-placeholder-4.jpg'
tags: ['algorithm']
updatedDate: 'July 4 2026'
draft: false
---

本题目是力扣 84 题，柱状图中的最大矩形。我自己没有想到最佳的解法，这里记录一下看了题解的思路之后实现的解法。
这道题是用单调栈求解，有一个非常有用的 trick ，那就是给原始数组的首尾各加一个哨兵位，这样能够把两种特殊情况裁剪掉：空栈、遍历完数组后栈不空。

## [题目](https://leetcode.cn/problems/largest-rectangle-in-histogram)

给定 n 个非负整数，用来表示柱状图中各个柱子的高度。每个柱子彼此相邻，且宽度为 1 。

求在该柱状图中，能够勾勒出来的矩形的最大面积。

## 解法

这道题是单调栈的经典例题。维护一个单调栈，栈中放置高度非递减的柱子的下标。
遍历柱状图，如果当前的柱子不低于栈顶的柱子，那么就入栈，否则，弹出栈顶元素，计算以该元素为高度的矩形面积，更新最大面积。

这样做的原理是，如果当前遍历的柱子的高度低于栈顶的柱子高度，那么表示当前的柱子是栈顶柱子右侧第一个比它高度要低的柱子，这个柱子可以作为矩形的右边界。
而左边界也很好找，左边界恰好就是把栈顶柱子弹出之后，新的栈顶柱子的位置。

```cpp
class Solution {
public:
    int largestRectangleArea(vector<int>& heights) {
        vector<int> mock_heights;
        mock_heights.push_back(0);
        for (auto h : heights) {
            mock_heights.push_back(h);
        }
        mock_heights.push_back(0);

        stack<int> s;
        s.push(0);
        
        int max_area = 0;
        for (int i = 1; i < mock_heights.size(); ++i) {
            if (mock_heights[i] >= mock_heights[s.top()]) {
                s.push(i);
                continue;
            }
            while (mock_heights[i] < mock_heights[s.top()]) {
                int h = mock_heights[s.top()];
                s.pop();
                int w = i - s.top() - 1;
                max_area = max(max_area, h * w);
            }
            s.push(i);
        }
        return max_area;
    }
};
```
