---
title: '算法积累：全排列'
description: 'leetcode42题全排列，回溯算法的典型例题'
pubDate: 'July 1 2026'
heroImage: '../../assets/blog-placeholder-3.jpg'
tags: ['algorithm']
updatedDate: 'July 1 2026'
draft: false
---

今天做了某司的一套笔试题目，两个小时四道题，题目难度适中，但是我做的是满头大汗，想必也没有什么后续了。
复盘了一下，我觉得不能再无脑的刷题，还是要系统性的记录和整理，才能真正有效的学习。

笔试题目里有一道比较复杂的题目，我能确定那道题目的解法应该是用贪心算法+回溯，但是太久没有真正写过了，所以犹犹豫豫也没能写一个完整的解法出来。
于是考试结束后，立马找到一个回溯的题目练一练手，找回感觉。
下面这一道“全排列”，就是比较经典的一道用回溯来解的题目。

## 题目

给定一个不含重复数字的数组 nums ，返回其所有可能的全排列 。你可以按任意顺序返回答案。

示例 ：
> 输入：nums = [1,2,3]
>
> 输出：[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]

## 我的解法

```cpp
class Solution {
public:
    vector<vector<int>> res;
    vector<int> ans;
    vector<int> used;

    void Backtrack(const vector<int>& nums) {
        if (ans.size() == nums.size()) {
            res.push_back(ans);
            return;
        }
        int i = 0;
        for (; i < used.size(); i++) {
            if (used[i] == 0) {
                used[i] = 1;
                ans.push_back(nums[i]);
                Backtrace(nums);
                used[i] = 0;
                ans.pop_back();
            }
        }
    }

    vector<vector<int>> permute(vector<int>& nums) {
        used.resize(nums.size(), 0);
        Backtrack(nums);
        return res;
    }
};
```

我的解法使用了一个辅助数组 `used` 来记录每个元素是否已经被使用过。
在计算时，找到当前的第一个没有被用过的数加入排列，然后递归，递归结束后再把当前这个数从排列中取出，达到回朔的效果。

## 优化：不用辅助数组

在阅读了官方答案后，我对我的解答做了一次优化，优化后可以不使用辅助数组解决这个问题。
核心思路是用原始的数组 `nums` 来记录每个元素是否被使用过，我们可以把用过的元素放在数组左边，没用过的放在右边，回溯也从修改辅助数组改为交换 `nums` 数组元素。

```cpp
class Solution {
public:
    vector<vector<int>> res;

    void Backtrack(vector<int>& nums, int idx) {
        if (idx == nums.size()) {
            res.push_back(nums);
            return;
        }
        for (int i = idx; i < nums.size(); i++) {
            swap(nums[idx], nums[i]);
            Backtrack(nums, idx + 1);
            swap(nums[idx], nums[i]);
        }
    }

    vector<vector<int>> permute(vector<int>& nums) {
        Backtrack(nums, 0);
        return res;
    }
};
```

在原始数组 `nums` 中，`[0, idx - 1]` 位置的元素已经确定，`[idx, nums.size() - 1]` 位置的元素还未确定。

结合代码具体来看，`Backtrack` 函数中的 `idx` 参数表示当前要确定的排列位置，`i` 从 `idx` 开始遍历到数组末尾，每次将 `nums[i]` 与 `nums[idx]` 交换，然后递归处理 `idx + 1` 位置的元素，最后再将 `nums[i]` 与 `nums[idx]` 交换回来，达到回朔的效果。

新的解法清晰简洁，很是不错。
