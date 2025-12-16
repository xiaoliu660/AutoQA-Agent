# SauceDemo - 登录（手工验收）

## Preconditions

- Base URL 可访问：`https://www.saucedemo.com/`
- 有可用测试账号：
  - Username: `standard_user`
  - Password: `secret_sauce`
- 浏览器允许加载 JavaScript（该站点为 SPA）

## Steps

1. Navigate to /
2. Verify the page shows the login form with fields "Username" and "Password"
3. Fill the "Username" field with standard_user
4. Fill the "Password" field with secret_sauce
5. Click the "Login" button
6. Verify the user is logged in and sees the inventory/products page (e.g. header shows "Products")
7. Verify the cart icon is visible
