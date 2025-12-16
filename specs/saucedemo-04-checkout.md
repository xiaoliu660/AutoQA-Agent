# SauceDemo - 结算流程（手工验收）

## Preconditions

- Base URL 可访问：`https://www.saucedemo.com/`
- 有可用测试账号：
  - Username: `standard_user`
  - Password: `secret_sauce`

## Steps

1. Navigate to /
2. Fill the "Username" field with standard_user
3. Fill the "Password" field with secret_sauce
4. Click the "Login" button
5. Verify the user is logged in and sees the inventory/products page (e.g. header shows "Products")

6. Click "Add to cart" for any product
7. Verify the cart icon badge count becomes 1

8. Click the cart icon
9. Verify the cart page shows "Your Cart" and contains at least 1 item
10. Click the "Checkout" button

11. Verify the checkout information page is shown (e.g. title contains "Checkout: Your Information")
12. Fill in First Name with `Test`
13. Fill in Last Name with `User`
14. Fill in Postal Code/Zip with `100000`
15. Click the "Continue" button

16. Verify the checkout overview page is shown (e.g. title contains "Checkout: Overview")
17. Verify the overview shows:
    - item(s) to purchase
    - item total, tax, and total

18. Click the "Finish" button
19. Verify the checkout complete page is shown (e.g. title contains "Checkout: Complete!")
20. Verify the page shows an order confirmation (e.g. "Thank you for your order!")

21. Click the "Back Home" button
22. Verify the user returns to the inventory/products page
