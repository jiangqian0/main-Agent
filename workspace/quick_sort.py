def quick_sort(arr):
    """
    快速排序算法
    
    Args:
        arr: 待排序的列表
        
    Returns:
        排序后的列表
    """
    if len(arr) <= 1:
        return arr
    
    pivot = arr[len(arr) // 2]  # 选择中间元素作为基准
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    
    return quick_sort(left) + middle + quick_sort(right)


def quick_sort_inplace(arr, low=0, high=None):
    """
    原地快速排序（空间复杂度更优）
    
    Args:
        arr: 待排序的列表
        low: 起始索引
        high: 结束索引
    """
    if high is None:
        high = len(arr) - 1
    
    if low < high:
        pivot_index = partition(arr, low, high)
        quick_sort_inplace(arr, low, pivot_index - 1)
        quick_sort_inplace(arr, pivot_index + 1, high)


def partition(arr, low, high):
    """分区函数"""
    pivot = arr[high]
    i = low - 1
    
    for j in range(low, high):
        if arr[j] <= pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    
    arr[i + 1], arr[high] = arr[high], arr[i + 1]
    return i + 1


# 测试代码
if __name__ == "__main__":
    # 测试非原地版本
    test_arr1 = [64, 34, 25, 12, 22, 11, 90, 88, 45, 50]
    print("原始数组:", test_arr1)
    sorted_arr1 = quick_sort(test_arr1.copy())
    print("排序后（非原地）:", sorted_arr1)
    
    # 测试原地版本
    test_arr2 = [64, 34, 25, 12, 22, 11, 90, 88, 45, 50]
    print("\n原始数组:", test_arr2)
    quick_sort_inplace(test_arr2)
    print("排序后（原地）:", test_arr2)
    
    # 测试边界情况
    print("\n空数组:", quick_sort([]))
    print("单元素:", quick_sort([1]))
    print("已排序:", quick_sort([1, 2, 3, 4, 5]))
    print("逆序:", quick_sort([5, 4, 3, 2, 1]))
