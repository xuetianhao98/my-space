---
title: '算法积累：回文子串'
description: 'LeetCode 647 题回文子串'
pubDate: 'July 7 2026'
heroImage: '../../assets/blog-placeholder-3.jpg'
tags: ['algorithm']
updatedDate: 'July 7 2026'
draft: false
---

这道题目颇为神奇，我第一时间想到用动态规划来解题，也写出了很简洁的代码，但是看题解才发现，竟然不是最佳解法。

本文先记录动态规划写法，日后有空再研究一下最优解。

## [回文子串](https://leetcode.cn/problems/palindromic-substrings/)

给你一个字符串 `s`，请你统计并返回这个字符串中回文子串的数目。

回文字符串是正着读和倒过来读一样的字符串。

子字符串是字符串中由连续字符组成的一个序列。

## 动态规划

动态规划的思路比较简单，定义 `dp[i][j]` 表示 `s[i..j]` 是否为回文串，如果是则为 1，否则为 0。
其状态转移方程也很容易就能得到：
- 当 `i == j` 时，`dp[i][j] = 1`；
- 当 `i + 1 == j` 且 `s[i] == s[j]` 时，`dp[i][j] = 1`；
- 当 `j - i > 1`、`dp[i + 1][j - 1] == 1` 且 `s[i] == s[j]` 时，`dp[i][j] = 1`。
其中第二种情况处理子串只有两个字符时的特殊情况。

代码简洁优雅，非常明了。

```cpp
class Solution {
public:
    int countSubstrings(string s) {
        int n = s.length();
        vector<vector<char>> dp(n, vector<char>(n, 0));
        int ans = 0;
        for (int j = 0; j < n; ++j) {
            for (int i = 0; i < j + 1; ++i) {
                if (i == j ||
                    i + 1 == j && s[i] == s[j] ||
                    dp[i + 1][j - 1] == 1 && s[i] == s[j]) {
                    dp[i][j] = 1;
                    ans++;
                }
            }
        }
        return ans;
    }
};
```
