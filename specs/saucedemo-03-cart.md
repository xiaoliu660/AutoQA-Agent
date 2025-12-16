# SauceDemo - 购物车增删与数量徽标（手工验收）

## Preconditions

- Base URL 可访问：`https://www.saucedemo.com/`
- 有可用测试账号：
  - Username: `standard_user`
  - Password: `secret_sauce`
- 建议先通过侧边菜单执行一次 "Reset App State"（保证购物车为空，便于重复执行）

## Steps

1. Navigate to /
2. Fill the "Username" field with standard_user
3. Fill the "Password" field with secret_sauce
4. Click the "Login" button
5. Verify the user is logged in and sees the inventory/products page (e.g. header shows "Products")

6. (Optional) Open the left menu (hamburger/menu button)
7. (Optional) Click "Reset App State"
8. Verify the cart badge is not shown (or shows 0)

9. Click "Add to cart" for any product
10. Verify the button for that product changes to "Remove"
11. Verify the cart icon badge count becomes 1

12. Click "Add to cart" for another product
13. Verify the cart icon badge count becomes 2

14. Click the cart icon
15. Verify the cart page shows "Your Cart" and lists the selected products

16. Click "Remove" for one of the items in the cart
17. Verify the removed item disappears from the cart list
18. Verify the cart icon badge count decreases by 1

19. Click "Continue Shopping"
20. Verify the user returns to the inventory/products page
